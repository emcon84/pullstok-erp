import { describe, it, expect, vi, afterEach } from "vitest";
import { generateAfipQrDataUrl } from "@/utils/afipQrImage";
import type { AfipQrPayload } from "@/utils/afipQr";

const validPayload: AfipQrPayload = {
  fecha: "2026-08-21",
  cuit: 30709706701,
  ptoVta: 2,
  tipoCmp: 6,
  nroCmp: 1,
  importe: 211907.92,
  tipoDocRec: 80,
  nroDocRec: 20201731594,
  codAut: 86340779640924,
};

describe("generateAfipQrDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve null sin canvas disponible (jsdom no implementa getContext)", () => {
    expect(generateAfipQrDataUrl(validPayload)).toBeNull();
  });

  it("devuelve la data URL PNG cuando el canvas funciona y dibuja los módulos", () => {
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,FAKEQR",
    );

    const result = generateAfipQrDataUrl(validPayload);

    expect(result).toBe("data:image/png;base64,FAKEQR");
    // Dibuja el fondo blanco + los módulos oscuros del QR
    expect(fillRect.mock.calls.length).toBeGreaterThan(1);
  });

  it("devuelve null (sin lanzar) con payload inválido", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,FAKEQR",
    );

    expect(generateAfipQrDataUrl({ ...validPayload, codAut: NaN })).toBeNull();
  });
});