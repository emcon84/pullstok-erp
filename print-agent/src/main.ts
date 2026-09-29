import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createConfigStore, resolveConfigPath } from './config';
import { listWindowsPrinters } from './printers';
import { createAgentServer } from './server';
import { createWindowsSpooler } from './spooler';

const VERSION = process.env.PULLSTOK_PRINT_VERSION ?? '1.0.0';

const configPath = resolveConfigPath();
const logPath = join(dirname(configPath), 'agent.log');

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, line + '\n');
  } catch {
    // logging must never take the agent down
  }
}

const config = createConfigStore(configPath);
const port = Number(process.env.PULLSTOK_PRINT_PORT) || config.get().port;

const server = createAgentServer({
  spooler: createWindowsSpooler(),
  listPrinters: listWindowsPrinters,
  config,
  version: VERSION,
  log,
});

server.on('error', (e: NodeJS.ErrnoException) => {
  log(e.code === 'EADDRINUSE' ? `Port ${port} is already in use; exiting.` : `Server error: ${e.message}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => log(`Pullstok print agent ${VERSION} listening on 127.0.0.1:${port}`));

function shutdown(signal: string) {
  log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
