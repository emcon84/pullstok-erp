import express from "express";
import request from "supertest";
import { responseCompression } from "../../src/middlewares/responseCompression";

const big = {
  items: Array.from({ length: 500 }, (_, i) => ({
    id: i,
    name: `Producto ${i}`,
    description: "descripcion larga de ejemplo ".repeat(3),
  })),
};

const makeApp = () => {
  const app = express();
  app.use(responseCompression());
  app.get("/big", (_req, res) => res.json(big));
  app.get("/small", (_req, res) => res.json({ ok: true }));
  app.get("/events", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.write("data: hello\n\n".repeat(200));
    res.end();
  });
  return app;
};

describe("responseCompression", () => {
  it("comprime con gzip un JSON grande cuando el cliente lo acepta", async () => {
    const res = await request(makeApp()).get("/big").set("Accept-Encoding", "gzip");

    expect(res.headers["content-encoding"]).toBe("gzip");
    // El cliente descomprime de forma transparente: el contenido no cambia.
    expect(res.body).toEqual(big);
  });

  it("no comprime si el cliente no acepta compresión", async () => {
    const res = await request(makeApp()).get("/big").set("Accept-Encoding", "identity");

    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body).toEqual(big);
  });

  it("no comprime respuestas chicas (bajo el umbral de 1 KB)", async () => {
    const res = await request(makeApp()).get("/small").set("Accept-Encoding", "gzip");

    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body).toEqual({ ok: true });
  });

  it("no comprime streams de eventos (SSE)", async () => {
    const res = await request(makeApp()).get("/events").set("Accept-Encoding", "gzip");

    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});
