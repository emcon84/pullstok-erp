// Verifica el cableado: app.ts debe registrar la compresión de respuestas
// (el Dashboard bajaba ~5,7 MB de /api/products sin comprimir).
jest.mock("../src/config/db", () => ({ __esModule: true, default: jest.fn() }));

import app from "../src/app";

describe("app — compresión de respuestas", () => {
  it("registra el middleware de compresión antes de las rutas", () => {
    const stack: Array<{ name: string; handle: { name?: string }; route?: unknown }> =
      (app as any)._router.stack;
    const names = stack.map((layer) => layer.name);

    const compressionIdx = names.indexOf("compression");
    const firstRouterIdx = names.indexOf("router");

    expect(compressionIdx).toBeGreaterThan(-1);
    if (firstRouterIdx > -1) expect(compressionIdx).toBeLessThan(firstRouterIdx);
  });
});
