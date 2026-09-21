import { formatServerTiming } from "../../src/utils/serverTiming";

describe("formatServerTiming", () => {
  it("formatea cada métrica como nombre;dur=ms separadas por coma", () => {
    expect(formatServerTiming({ db: 12.34, map: 0.5 })).toBe(
      "db;dur=12.3, map;dur=0.5",
    );
  });

  it("una sola métrica no lleva coma", () => {
    expect(formatServerTiming({ db: 100 })).toBe("db;dur=100.0");
  });

  it("sin métricas devuelve string vacío", () => {
    expect(formatServerTiming({})).toBe("");
  });
});
