import { describe, expect, it } from 'vitest';
import { createRelay, type RelayDeps } from '../src/relay';
import { DEFAULT_CONFIG, type AgentConfig, type ConfigStore } from '../src/config';
import type { RawSpooler } from '../src/spooler';

const SERVER = 'https://api.test/api';
const TOKEN = 'agent1.s3cretvalue';

function memoryStore(initial: Partial<AgentConfig> = {}): ConfigStore {
  let cfg: AgentConfig = { ...DEFAULT_CONFIG, serverUrl: SERVER, ...initial };
  return { get: () => cfg, update: (p) => (cfg = { ...cfg, ...p }) };
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(opts: { paired?: boolean; handler?: (c: Call) => Response | Promise<Response> } = {}) {
  const calls: Call[] = [];
  const events: string[] = [];
  const logs: string[] = [];
  const delays: number[] = [];
  const printed: { printer: string; bytes: Uint8Array }[] = [];
  let spoolFail: Error | null = null;
  let active = 0;
  let maxActive = 0;
  let t = 1_000_000;

  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      method: init.method ?? 'GET',
      url,
      headers: { ...((init.headers ?? {}) as Record<string, string>) },
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      await Promise.resolve();
      return await (opts.handler ?? (() => json(200, { ok: true })))(call);
    } finally {
      active--;
    }
  }) as unknown as typeof fetch;

  const spooler: RawSpooler = {
    async print(printer, bytes) {
      events.push(`print:${printer}`);
      if (spoolFail) throw spoolFail;
      printed.push({ printer, bytes });
    },
  };

  const store = memoryStore(opts.paired === false ? {} : { agentId: 'agent1', agentToken: TOKEN });
  const deps: RelayDeps = {
    config: store,
    fetch: fetchImpl,
    spooler,
    listPrinters: async () => ['OCOM 58', 'PDF'],
    sleep: async (ms) => {
      delays.push(ms);
      t += ms;
      await new Promise((r) => setTimeout(r, 0));
    },
    now: () => t,
    log: (m) => logs.push(m),
  };
  const relay = createRelay(deps);
  return {
    relay,
    store,
    calls,
    events,
    logs,
    delays,
    printed,
    failSpooler: (e: Error) => (spoolFail = e),
    advance: (ms: number) => (t += ms),
    maxActive: () => maxActive,
  };
}

const job = (id: string, localName: string | null = 'OCOM 58', bytes = [0x1b, 0x40, 0x41]) => ({
  id,
  printerId: 'p1',
  localName,
  printerName: 'Caja',
  payloadBase64: Buffer.from(bytes).toString('base64'),
});

const emptyJobs = (c: Call) => (c.url.endsWith('/jobs') ? json(200, []) : json(200, { ok: true }));

function servingOnce(jobs: unknown[], extra?: (c: Call) => Response | undefined) {
  let served = false;
  return (c: Call) => {
    const r = extra?.(c);
    if (r) return r;
    if (c.url.endsWith('/jobs')) {
      if (served) return json(200, []);
      served = true;
      return json(200, jobs);
    }
    return json(200, { ok: true });
  };
}

describe('pairing', () => {
  it('redeems the code without auth and stores the credentials', async () => {
    const s = setup({
      paired: false,
      handler: (c) =>
        c.url.endsWith('/print-agent/pair')
          ? json(200, { agentId: 'agent1', agentToken: TOKEN, name: 'Caja' })
          : json(200, []),
    });
    expect(s.relay.status().paired).toBe(false);
    const res = await s.relay.pair('ABCDE-12345');
    expect(res).toEqual({ ok: true, agentId: 'agent1', name: 'Caja' });
    expect(JSON.stringify(res)).not.toContain('s3cret');
    expect(s.calls[0]).toMatchObject({ method: 'POST', url: `${SERVER}/print-agent/pair`, body: { code: 'ABCDE-12345' } });
    expect(s.calls[0].headers.Authorization).toBeUndefined();
    expect(s.store.get()).toMatchObject({ agentId: 'agent1', agentToken: TOKEN });
    expect(s.relay.status().paired).toBe(true);
    s.relay.stop();
  });

  it('rejects an invalid code with the backend message and stores nothing', async () => {
    const s = setup({ paired: false, handler: () => json(400, { message: 'Código de emparejamiento inválido o vencido' }) });
    await expect(s.relay.pair('bad')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/inválido/) });
    expect(s.store.get().agentToken).toBeNull();
    expect(s.relay.status().paired).toBe(false);
  });

  it('maps a network failure to 502', async () => {
    const s = setup({
      paired: false,
      handler: () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(s.relay.pair('x')).rejects.toMatchObject({ status: 502 });
  });
});

describe('tick', () => {
  it('does nothing when unpaired', async () => {
    const s = setup({ paired: false });
    await s.relay.tick();
    expect(s.calls).toHaveLength(0);
  });

  it('sends a heartbeat with local printers, then polls, with bearer header only', async () => {
    const s = setup({ handler: emptyJobs });
    await s.relay.tick();
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${SERVER}/print-agent/heartbeat`,
      `GET ${SERVER}/print-agent/jobs`,
    ]);
    expect(s.calls[0].body).toEqual({ localPrinters: ['OCOM 58', 'PDF'] });
    for (const c of s.calls) {
      expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(c.url).not.toContain('s3cret');
      expect(c.url).not.toContain('agent1.');
    }
  });

  it('heartbeats only every 30 s', async () => {
    const s = setup({ handler: emptyJobs });
    await s.relay.tick();
    await s.relay.tick();
    expect(s.calls.filter((c) => c.url.endsWith('/heartbeat'))).toHaveLength(1);
    s.advance(31_000);
    await s.relay.tick();
    expect(s.calls.filter((c) => c.url.endsWith('/heartbeat'))).toHaveLength(2);
  });

  it('prints each job on its local printer and reports the result before the next poll', async () => {
    const s = setup({
      handler: servingOnce([job('j1'), job('j2', 'PDF')], (c) => {
        s.events.push(`${c.method} ${c.url.replace(SERVER, '')}`);
        return undefined;
      }),
    });
    await s.relay.tick();
    await s.relay.tick();
    expect(s.printed.map((p) => p.printer)).toEqual(['OCOM 58', 'PDF']);
    expect(Array.from(s.printed[0].bytes)).toEqual([0x1b, 0x40, 0x41]);
    const i = (e: string) => s.events.indexOf(e);
    expect(i('print:OCOM 58')).toBeLessThan(i('POST /print-agent/jobs/j1/result'));
    expect(i('POST /print-agent/jobs/j1/result')).toBeLessThan(i('print:PDF'));
    const lastResult = s.events.lastIndexOf('POST /print-agent/jobs/j2/result');
    const polls = s.events.map((e, n) => (e === 'GET /print-agent/jobs' ? n : -1)).filter((n) => n >= 0);
    expect(polls).toHaveLength(2);
    expect(polls[1]).toBeGreaterThan(lastResult);
    const report = s.calls.find((c) => c.url.endsWith('/jobs/j1/result'))!;
    expect(report.body).toEqual({ status: 'PRINTED' });
    expect(s.maxActive()).toBe(1);
  });

  it('reports ERROR when the job has no local printer', async () => {
    const s = setup({ handler: servingOnce([job('j1', null)]) });
    await s.relay.tick();
    expect(s.printed).toHaveLength(0);
    const report = s.calls.find((c) => c.url.endsWith('/jobs/j1/result'))!;
    expect(report.body).toMatchObject({ status: 'ERROR' });
    expect((report.body as { errorMessage: string }).errorMessage).toMatch(/impresora/i);
  });

  it('reports ERROR when the spooler fails, without leaking secrets', async () => {
    const s = setup({ handler: servingOnce([job('j1')]) });
    s.failSpooler(new Error('powershell exited with 1'));
    await s.relay.tick();
    const report = s.calls.find((c) => c.url.endsWith('/jobs/j1/result'))!;
    expect(report.body).toMatchObject({ status: 'ERROR' });
    expect(JSON.stringify(report.body)).not.toContain('s3cret');
  });

  it('never prints the same job twice when the result report failed', async () => {
    let resultAttempts = 0;
    const s = setup({
      handler: (c) => {
        if (c.url.endsWith('/jobs')) return json(200, [job('j1')]);
        if (c.url.endsWith('/result')) {
          resultAttempts++;
          return resultAttempts === 1 ? json(503, { message: 'down' }) : json(200, { ok: true });
        }
        return json(200, { ok: true });
      },
    });
    await s.relay.tick(); // prints, report fails
    await s.relay.tick(); // retries the report first, never prints again
    await s.relay.tick();
    expect(s.printed).toHaveLength(1);
    expect(resultAttempts).toBeGreaterThanOrEqual(2);
  });
});

describe('errors', () => {
  it('backs off exponentially 1s to 30s on network errors and resets on success', async () => {
    let fail = true;
    const s = setup({
      handler: (c) => {
        if (fail) throw new Error('ENOTFOUND');
        return emptyJobs(c);
      },
    });
    const waits: number[] = [];
    for (let n = 0; n < 7; n++) waits.push(await s.relay.tick());
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    fail = false;
    expect(await s.relay.tick()).toBe(3000);
    fail = true;
    s.advance(31_000);
    expect(await s.relay.tick()).toBe(1000);
  });

  it('treats 5xx as a retriable error', async () => {
    const s = setup({ handler: () => json(503, { message: 'x' }) });
    expect(await s.relay.tick()).toBe(1000);
    expect(s.relay.status().paired).toBe(true);
  });

  it('stops polling and marks unpaired on 401', async () => {
    const s = setup({ handler: () => json(401, { message: 'Token inválido' }) });
    await s.relay.tick();
    expect(s.relay.status().paired).toBe(false);
    expect(s.store.get().agentToken).toBeNull();
    const before = s.calls.length;
    await s.relay.tick();
    expect(s.calls).toHaveLength(before);
  });

  it('never logs the token or secret', async () => {
    const s = setup({
      handler: () => {
        throw new Error(`fetch failed for Bearer ${TOKEN}`);
      },
    });
    await s.relay.tick();
    expect(s.logs.length).toBeGreaterThan(0);
    expect(s.logs.join('\n')).not.toContain('s3cret');
  });
});

describe('start/stop loop', () => {
  it('runs sequential ticks using the injected sleep until stopped', async () => {
    const s = setup({ handler: emptyJobs });
    s.relay.start();
    await new Promise((r) => setTimeout(r, 30));
    s.relay.stop();
    await new Promise((r) => setTimeout(r, 10));
    const n = s.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(s.calls.length).toBe(n);
    expect(s.maxActive()).toBe(1);
    expect(s.delays[0]).toBe(3000);
  });

  it('start is idempotent (no second concurrent loop)', async () => {
    const s = setup({ handler: emptyJobs });
    s.relay.start();
    s.relay.start();
    await new Promise((r) => setTimeout(r, 30));
    s.relay.stop();
    expect(s.maxActive()).toBe(1);
  });
});
