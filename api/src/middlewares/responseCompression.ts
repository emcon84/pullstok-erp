import compression from "compression";

/**
 * Compresión gzip de las respuestas HTTP.
 *
 * Sin esto, `GET /api/products` del Dashboard bajaba ~5,7 MB de JSON sin
 * comprimir (medido en producción con 4228 productos): en mobile son varios
 * segundos de descarga. El JSON comprime muy bien con gzip.
 *
 * - Solo comprime tipos compresibles (JSON, texto, SVG); imágenes, PDF y
 *   backups .gz pasan tal cual.
 * - `threshold`: por debajo de 1 KB no vale la pena el costo de CPU.
 * - Los streams `text/event-stream` (SSE) no se comprimen: gzip bufferiza y
 *   rompería el envío incremental.
 * - zlib corre en el threadpool de libuv: no bloquea el event loop.
 */
export const responseCompression = () =>
  compression({
    threshold: 1024,
    filter: (req, res) => {
      const type = String(res.getHeader("Content-Type") ?? "");
      if (type.includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  });
