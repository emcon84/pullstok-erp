import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentServer, type RawSpooler } from '../src/server';
import { DEFAULT_CONFIG, type AgentConfig, type ConfigStore } from '../src/config';

const ALLOWED = 'https://app.pullstok.com';

class FakeSpooler implements RawSpooler {
  calls: { printer: string; bytes: Uint8Array }[] = [];
  fail: Error | null = null;
  async print(printer: string, bytes: Uint8Array) {
    if (this.fail) throw this.fail;
    this.calls.push({ printer, bytes });
  }
}

function memoryStore(initial: Partial<AgentConfig> = {}): ConfigStore {
  let cfg: AgentConfig = { ...DEFAULT_CONFIG, ...initial };
  return {
    get: () => cfg,
    update: (patch) => (cfg = { ...cfg, ...patch }),
  };
}

let server: Server;
let base: string;
let spooler: FakeSpooler;
let store: ConfigStore;
let lister: () => Promise<string[]>;
let pairImpl: (code: string) => Promise<unknown>;
let pairedState = false;

async function listen(s: Server) {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

async function stop() {
  await new Promise<void>((r) => server.close(() => r()));
}

async function start(initial: Partial<AgentConfig> = {}) {
  spooler = new FakeSpooler();
  store = memoryStore(initial);
  server = createAgentServer({
    spooler,
    listPrinters: () => lister(),
    config: store,
    version: '1.2.3',
    platform: 'win32',
    relay: { pair: (code) => pairImpl(code), status: () => ({ paired: pairedState }) },
  });
  await listen(server);
}

beforeEach(async () => {
  lister = async () => ['OCOM 58', 'PDF'];
  pairedState = false;
  pairImpl = async () => ({ ok: true, agentId: 'a1', name: 'Caja' });
  await start({ printer: 'OCOM 58' });
});
afterEach(stop);

describe('GET /health', () => {
  it('reports name, version, printer and platform', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: 'pullstok-print-agent',
      version: '1.2.3',
      printer: 'OCOM 58',
      platform: 'win32',
      paired: false,
      serverUrl: DEFAULT_CONFIG.serverUrl,
    });
  });
});

describe('GET /printers', () => {
  it('lists printers', async () => {
    const res = await fetch(`${base}/printers`);
    expect(await res.json()).toEqual({ printers: ['OCOM 58', 'PDF'] });
  });
  it('returns 502 when the lister fails', async () => {
    lister = async () => {
      throw new Error('boom');
    };
    const res = await fetch(`${base}/printers`);
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/impresoras/i);
  });
});

describe('PUT /config', () => {
  const put = (body: unknown) =>
    fetch(`${base}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('persists a printer that exists', async () => {
    const res = await put({ printer: 'PDF' });
    expect(res.status).toBe(200);
    expect((await res.json()).printer).toBe('PDF');
    expect(store.get().printer).toBe('PDF');
  });
  it('rejects a printer that is not installed', async () => {
    const res = await put({ printer: 'Fantasma' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Fantasma/);
    expect(store.get().printer).toBe('OCOM 58');
  });
  it('rejects a body without printer', async () => {
    expect((await put({})).status).toBe(400);
  });
  it('rejects invalid JSON', async () => {
    const res = await fetch(`${base}/config`, { method: 'PUT', body: '{x' });
    expect(res.status).toBe(400);
  });
});

describe('POST /print', () => {
  const post = (body: Buffer) =>
    fetch(`${base}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(body),
    });

  it('sends the raw bytes to the configured printer', async () => {
    const bytes = Buffer.from([0x1b, 0x40, 0x41, 0x0a]);
    const res = await post(bytes);
    expect(res.status).toBe(200);
    expect(spooler.calls).toHaveLength(1);
    expect(spooler.calls[0].printer).toBe('OCOM 58');
    expect(Buffer.from(spooler.calls[0].bytes)).toEqual(bytes);
  });
  it('409 with a Spanish message when no printer is configured', async () => {
    await stop();
    await start({ printer: null });
    const res = await post(Buffer.from([1]));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/impresora/i);
    expect(spooler.calls).toHaveLength(0);
  });
  it('413 when body exceeds 1 MB', async () => {
    const res = await post(Buffer.alloc(1024 * 1024 + 1, 1));
    expect(res.status).toBe(413);
    expect(spooler.calls).toHaveLength(0);
  });
  it('400 for an empty body', async () => {
    expect((await post(Buffer.alloc(0))).status).toBe(400);
  });
  it('502 when the spooler fails', async () => {
    spooler.fail = new Error('spooler down');
    const res = await post(Buffer.from([1]));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/impresora/i);
  });
});

describe('POST /test', () => {
  it('prints a test ticket', async () => {
    const res = await fetch(`${base}/test`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(spooler.calls).toHaveLength(1);
    expect(spooler.calls[0].bytes[0]).toBe(0x1b);
  });
  it('409 when no printer is configured', async () => {
    await stop();
    await start({ printer: null });
    expect((await fetch(`${base}/test`, { method: 'POST' })).status).toBe(409);
  });
});

describe('routing', () => {
  it('404 JSON for unknown paths', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBeTruthy();
  });
  it('405 for a wrong method', async () => {
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
  });
});

describe('origin allow-list and CORS', () => {
  it('rejects a disallowed Origin with 403 and no CORS headers', async () => {
    const res = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect((await res.json()).message).toMatch(/origen/i);
  });
  it('does not print for a disallowed Origin', async () => {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: Buffer.from([1]),
    });
    expect(res.status).toBe(403);
    expect(spooler.calls).toHaveLength(0);
  });
  it('allows requests with no Origin header', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('adds CORS headers for an allowed Origin', async () => {
    const res = await fetch(`${base}/health`, { headers: { Origin: ALLOWED } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(res.headers.get('access-control-allow-private-network')).toBe('true');
    expect(res.headers.get('vary')).toMatch(/Origin/);
  });
  it('answers the preflight for an allowed Origin echoing requested headers', async () => {
    const res = await fetch(`${base}/print`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, x-custom',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect(res.headers.get('access-control-allow-headers')).toBe('content-type, x-custom');
    expect(res.headers.get('access-control-allow-private-network')).toBe('true');
    expect(res.headers.get('vary')).toMatch(/Origin/);
  });
  it('rejects the preflight for a disallowed Origin', async () => {
    const res = await fetch(`${base}/print`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('uses the configured allowedOrigins', async () => {
    await stop();
    await start({ printer: 'OCOM 58', allowedOrigins: ['https://otro.example'] });
    expect((await fetch(`${base}/health`, { headers: { Origin: 'https://otro.example' } })).status).toBe(200);
    expect((await fetch(`${base}/health`, { headers: { Origin: ALLOWED } })).status).toBe(403);
  });
});

describe('POST /pair', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('forwards the code to the relay and returns its result (no token)', async () => {
    let seen = '';
    pairImpl = async (code) => {
      seen = code;
      return { ok: true, agentId: 'a1', name: 'Caja' };
    };
    const res = await post({ code: 'ABCDE-12345' }, { Origin: ALLOWED });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, agentId: 'a1', name: 'Caja' });
    expect(seen).toBe('ABCDE-12345');
  });

  it('rejects origins that are not allowed', async () => {
    const res = await post({ code: 'x' }, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('answers the preflight with PNA headers for an allowed origin', async () => {
    const res = await fetch(`${base}/pair`, {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-private-network')).toBe('true');
  });

  it('validates the code', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
  });

  it('propagates the relay error status and message', async () => {
    pairImpl = async () => {
      throw Object.assign(new Error('Código de emparejamiento inválido o vencido'), { status: 400 });
    };
    const res = await post({ code: 'bad' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/inválido/);
  });

  it('reports paired state in /health', async () => {
    pairedState = true;
    const body = await (await fetch(`${base}/health`)).json();
    expect(body.paired).toBe(true);
  });

  it('rejects non-POST methods', async () => {
    expect((await fetch(`${base}/pair`)).status).toBe(405);
  });
});
