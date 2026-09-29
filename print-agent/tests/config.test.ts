import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, createConfigStore, resolveConfigPath } from '../src/config';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pp-cfg-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('config store', () => {
  it('returns defaults when the file is missing', () => {
    const store = createConfigStore(join(dir, 'nope', 'config.json'));
    expect(store.get()).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.port).toBe(9123);
    expect(DEFAULT_CONFIG.printer).toBeNull();
    expect(DEFAULT_CONFIG.allowedOrigins).toEqual(['https://app.pullstok.com', 'http://localhost:5173']);
  });

  it('returns defaults when the file is corrupt', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{not json');
    expect(createConfigStore(p).get()).toEqual(DEFAULT_CONFIG);
  });

  it('ignores invalid field types and keeps valid ones', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({ printer: 'OCOM', port: 'abc', allowedOrigins: 'x' }));
    const cfg = createConfigStore(p).get();
    expect(cfg.printer).toBe('OCOM');
    expect(cfg.port).toBe(9123);
    expect(cfg.allowedOrigins).toEqual(DEFAULT_CONFIG.allowedOrigins);
  });

  it('persists updates creating parent directories', () => {
    const p = join(dir, 'a', 'b', 'config.json');
    const store = createConfigStore(p);
    const updated = store.update({ printer: 'OCOM 58' });
    expect(updated.printer).toBe('OCOM 58');
    expect(JSON.parse(readFileSync(p, 'utf8')).printer).toBe('OCOM 58');
    expect(createConfigStore(p).get().printer).toBe('OCOM 58');
  });

  it('resolves the path from env override, then APPDATA', () => {
    expect(resolveConfigPath({ PULLSTOK_PRINT_CONFIG: '/x/c.json' })).toBe('/x/c.json');
    expect(resolveConfigPath({ APPDATA: '/roaming' })).toBe(join('/roaming', 'PullstokPrint', 'config.json'));
  });
});
