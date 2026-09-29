import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ConfigStore } from './config';
import type { RawSpooler } from './spooler';
import { buildTestTicket } from './testTicket';

export type { RawSpooler } from './spooler';

export const MAX_BODY_BYTES = 1024 * 1024;

export interface AgentDeps {
  spooler: RawSpooler;
  listPrinters: () => Promise<string[]>;
  config: ConfigStore;
  version: string;
  platform?: string;
  log?: (msg: string) => void;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const METHODS = 'GET, POST, PUT, OPTIONS';
const TOO_BIG = 'El ticket es demasiado grande (máximo 1 MB).';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      reject(new HttpError(413, TOO_BIG));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        chunks.length = 0;
        reject(new HttpError(413, TOO_BIG));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}

export function createAgentServer(deps: AgentDeps): Server {
  const log = deps.log ?? (() => {});

  const requirePrinter = (): string => {
    const printer = deps.config.get().printer;
    if (!printer) {
      throw new HttpError(
        409,
        'No hay una impresora configurada. Elegí una impresora desde la configuración del sistema.',
      );
    }
    return printer;
  };

  const listPrinters = async (): Promise<string[]> => {
    try {
      return await deps.listPrinters();
    } catch (e) {
      log(`list printers error: ${(e as Error).message}`);
      throw new HttpError(502, 'No se pudo obtener la lista de impresoras de Windows.');
    }
  };

  const printBytes = async (printer: string, bytes: Uint8Array) => {
    try {
      await deps.spooler.print(printer, bytes);
    } catch (e) {
      log(`spooler error: ${(e as Error).message}`);
      throw new HttpError(
        502,
        'No se pudo enviar el ticket a la impresora. Revisá que esté encendida y conectada.',
      );
    }
  };

  async function route(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const method = req.method ?? 'GET';
    const expect = (m: string) => {
      if (method !== m) throw new HttpError(405, 'Método no permitido.');
    };

    switch (path) {
      case '/health':
        expect('GET');
        return sendJson(res, 200, {
          name: 'pullstok-print-agent',
          version: deps.version,
          printer: deps.config.get().printer,
          platform: deps.platform ?? process.platform,
        });
      case '/printers':
        expect('GET');
        return sendJson(res, 200, { printers: await listPrinters() });
      case '/config': {
        expect('PUT');
        const raw = await readBody(req, 16 * 1024);
        let body: { printer?: unknown };
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new HttpError(400, 'El cuerpo debe ser JSON válido.');
        }
        if (!body || typeof body.printer !== 'string' || !body.printer) {
          throw new HttpError(400, 'Falta el nombre de la impresora.');
        }
        if (!(await listPrinters()).includes(body.printer)) {
          throw new HttpError(400, `La impresora "${body.printer}" no está instalada en esta PC.`);
        }
        return sendJson(res, 200, deps.config.update({ printer: body.printer }));
      }
      case '/print': {
        expect('POST');
        const printer = requirePrinter();
        const bytes = await readBody(req, MAX_BODY_BYTES);
        if (bytes.length === 0) throw new HttpError(400, 'El ticket está vacío.');
        await printBytes(printer, bytes);
        return sendJson(res, 200, { ok: true, bytes: bytes.length });
      }
      case '/test': {
        expect('POST');
        await printBytes(requirePrinter(), buildTestTicket());
        return sendJson(res, 200, { ok: true });
      }
      default:
        throw new HttpError(404, 'Ruta no encontrada.');
    }
  }

  return createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!deps.config.get().allowedOrigins.includes(origin)) {
        return sendJson(res, 403, { message: 'Origen no permitido.' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', METHODS);
      res.setHeader(
        'Access-Control-Allow-Headers',
        (req.headers['access-control-request-headers'] as string | undefined) ?? 'content-type',
      );
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    route(req, res).catch((e: unknown) => {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) return sendJson(res, e.status, { message: e.message });
      log(`unexpected error: ${(e as Error).message}`);
      sendJson(res, 500, { message: 'Error interno del agente.' });
    });
  });
}
