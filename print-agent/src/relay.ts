import type { ConfigStore } from './config';
import type { RawSpooler } from './spooler';

export interface RelayDeps {
  config: ConfigStore;
  spooler: RawSpooler;
  listPrinters: () => Promise<string[]>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (msg: string) => void;
}

export interface Relay {
  pair(code: string): Promise<{ ok: true; agentId: string; name: string | null }>;
  status(): { paired: boolean };
  /** One sequential iteration; resolves to the ms to wait before the next one. */
  tick(): Promise<number>;
  start(): void;
  stop(): void;
}

export class RelayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const POLL_INTERVAL_MS = 3000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REMEMBERED_JOBS = 200;

interface PendingResult {
  id: string;
  status: 'PRINTED' | 'ERROR';
  errorMessage?: string;
}

interface RemoteJob {
  id: string;
  localName: string | null;
  payloadBase64: string;
}

class Unauthorized extends Error {}

export function createRelay(deps: RelayDeps): Relay {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const rawLog = deps.log ?? (() => {});
  // Defense in depth: error messages from fetch must never leak credentials into the log file.
  const log = (msg: string) => {
    let out = msg;
    const { agentToken } = deps.config.get();
    if (agentToken) out = out.split(agentToken).join('[redacted]').split(agentToken.split('.').slice(1).join('.') || agentToken).join('[redacted]');
    rawLog(out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'));
  };

  let failures = 0;
  let lastHeartbeat = -Infinity;
  let running = false;
  let generation = 0;
  const pending: PendingResult[] = [];
  const handled = new Set<string>();

  const isPaired = () => !!deps.config.get().agentToken;
  const base = () => deps.config.get().serverUrl;

  // The token travels only in the Authorization header, never in a URL or a log line.
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = deps.config.get().agentToken;
    if (!token) throw new Unauthorized();
    const res = await doFetch(`${base()}/print-agent${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401) throw new Unauthorized();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function pair(code: string) {
    let res: Response;
    try {
      res = await doFetch(`${base()}/print-agent/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      log('pair: network error');
      throw new RelayError(502, 'No se pudo conectar con el servidor de Pullstok.');
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = typeof data.message === 'string' ? data.message : 'No se pudo emparejar el equipo.';
      throw new RelayError(res.status >= 500 ? 502 : res.status, msg);
    }
    if (typeof data.agentId !== 'string' || typeof data.agentToken !== 'string') {
      throw new RelayError(502, 'Respuesta inválida del servidor.');
    }
    deps.config.update({ agentId: data.agentId, agentToken: data.agentToken });
    failures = 0;
    lastHeartbeat = -Infinity;
    pending.length = 0;
    log(`paired as agent ${data.agentId}`);
    start();
    return { ok: true as const, agentId: data.agentId, name: typeof data.name === 'string' ? data.name : null };
  }

  function unpair() {
    deps.config.update({ agentId: null, agentToken: null });
    log('server rejected the agent credentials (401); unpaired, polling stopped');
  }

  async function flushPending() {
    while (pending.length > 0) {
      const r = pending[0];
      try {
        await call('POST', `/jobs/${encodeURIComponent(r.id)}/result`, {
          status: r.status,
          ...(r.errorMessage ? { errorMessage: r.errorMessage } : {}),
        });
      } catch (e) {
        // 404 = the server already closed that job (e.g. expired): nothing left to report.
        if (!(e instanceof Unauthorized) && (e as Error).message === 'HTTP 404') {
          pending.shift();
          continue;
        }
        throw e;
      }
      pending.shift();
    }
  }

  function remember(id: string) {
    handled.add(id);
    if (handled.size > MAX_REMEMBERED_JOBS) handled.delete(handled.values().next().value as string);
  }

  async function printJob(job: RemoteJob): Promise<PendingResult> {
    if (!job.localName) {
      return { id: job.id, status: 'ERROR', errorMessage: 'La impresora no está asignada a una impresora de Windows.' };
    }
    const bytes = Buffer.from(job.payloadBase64, 'base64');
    if (bytes.length === 0) return { id: job.id, status: 'ERROR', errorMessage: 'El ticket está vacío.' };
    try {
      await deps.spooler.print(job.localName, bytes);
      return { id: job.id, status: 'PRINTED' };
    } catch (e) {
      log(`job ${job.id}: spooler error: ${(e as Error).message}`);
      return {
        id: job.id,
        status: 'ERROR',
        errorMessage: 'No se pudo enviar el ticket a la impresora. Revisá que esté encendida y conectada.',
      };
    }
  }

  async function iterate() {
    if (now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      let localPrinters: string[] | undefined;
      try {
        localPrinters = await deps.listPrinters();
      } catch (e) {
        log(`list printers error: ${(e as Error).message}`);
      }
      await call('POST', '/heartbeat', localPrinters ? { localPrinters } : {});
      lastHeartbeat = now();
    }
    // Result reports go out before the next poll: the backend has no "in progress" state.
    await flushPending();
    const jobs = (await call('GET', '/jobs')) as RemoteJob[];
    for (const job of Array.isArray(jobs) ? jobs : []) {
      if (handled.has(job.id)) continue;
      const result = await printJob(job);
      remember(job.id);
      pending.push(result);
      await flushPending();
    }
  }

  async function tick(): Promise<number> {
    if (!isPaired()) return POLL_INTERVAL_MS;
    try {
      await iterate();
      failures = 0;
      return POLL_INTERVAL_MS;
    } catch (e) {
      if (e instanceof Unauthorized) {
        unpair();
        return POLL_INTERVAL_MS;
      }
      const wait = Math.min(BACKOFF_MIN_MS * 2 ** failures, BACKOFF_MAX_MS);
      failures++;
      log(`relay error: ${(e as Error).message}; retrying in ${wait} ms`);
      return wait;
    }
  }

  function start() {
    if (running) return;
    running = true;
    const mine = ++generation;
    void (async () => {
      while (running && generation === mine && isPaired()) {
        const wait = await tick();
        if (!running || generation !== mine || !isPaired()) break;
        await sleep(wait);
      }
      if (generation === mine) running = false;
    })();
  }

  function stop() {
    running = false;
    generation++;
  }

  return { pair, status: () => ({ paired: isPaired() }), tick, start, stop };
}
