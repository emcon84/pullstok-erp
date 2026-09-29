import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AgentConfig {
  printer: string | null;
  port: number;
  allowedOrigins: string[];
}

export interface ConfigStore {
  get(): AgentConfig;
  update(patch: Partial<AgentConfig>): AgentConfig;
}

export const DEFAULT_CONFIG: AgentConfig = {
  printer: null,
  port: 9123,
  allowedOrigins: ['https://app.pullstok.com', 'http://localhost:5173'],
};

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PULLSTOK_PRINT_CONFIG) return env.PULLSTOK_PRINT_CONFIG;
  const base = env.APPDATA ?? join(env.USERPROFILE ?? '.', 'AppData', 'Roaming');
  return join(base, 'PullstokPrint', 'config.json');
}

function sanitize(raw: unknown): AgentConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const validPort =
    typeof r.port === 'number' && Number.isInteger(r.port) && r.port > 0 && r.port < 65536;
  const validOrigins =
    Array.isArray(r.allowedOrigins) && r.allowedOrigins.every((o) => typeof o === 'string');
  return {
    printer: typeof r.printer === 'string' && r.printer.length > 0 ? r.printer : null,
    port: validPort ? (r.port as number) : DEFAULT_CONFIG.port,
    allowedOrigins: [...(validOrigins ? (r.allowedOrigins as string[]) : DEFAULT_CONFIG.allowedOrigins)],
  };
}

export function createConfigStore(path: string): ConfigStore {
  const read = (): AgentConfig => {
    try {
      return sanitize(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      return sanitize(null);
    }
  };
  return {
    get: read,
    update(patch) {
      const next = sanitize({ ...read(), ...patch });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(next, null, 2), 'utf8');
      return next;
    },
  };
}
