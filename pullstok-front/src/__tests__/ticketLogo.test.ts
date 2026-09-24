import { describe, it, expect, vi, afterEach } from "vitest";
import { processLogoPixels, prepareTicketLogo, prepareTicketLogoBitmap } from "@/utils/ticketLogo";

// Logo del ticket térmico: las térmicas son de 1 bit sobre papel blanco, así que
// un logo CLARO (pensado para tema oscuro) sobre fondo transparente hay que
// invertirlo para que se vea. Pura y sin red; canvas/fetch/Image se mockean.

const px = (...pixels: [number, number, number, number][]) =>
  new Uint8ClampedArray(pixels.flat());

/** Luminancia visible (R=G=B tras el proceso) del píxel i. */
const gray = (d: Uint8ClampedArray, i: number) => d[i * 4];
const alpha = (d: Uint8ClampedArray, i: number) => d[i * 4 + 3];

describe("processLogoPixels", () => {
  it("glifo BLANCO sobre transparente → glifo oscuro sobre blanco", () => {
    // 3 píxeles blancos opacos + 7 transparentes (fracción opaca 0,3 < 0,9).
    const white: [number, number, number, number] = [255, 255, 255, 255];
    const none: [number, number, number, number] = [0, 0, 0, 0];
    const d = processLogoPixels(px(white, white, white, none, none, none, none, none, none, none));
    expect(gray(d, 0)).toBeLessThan(60); // glifo ahora oscuro
    expect(gray(d, 5)).toBe(255); // el fondo queda blanco
    expect(alpha(d, 0)).toBe(255);
    expect(alpha(d, 5)).toBe(255);
  });

  it("borde semitransparente de un glifo blanco → gris intermedio (antialiasing)", () => {
    const white: [number, number, number, number] = [255, 255, 255, 255];
    const edge: [number, number, number, number] = [255, 255, 255, 128];
    const none: [number, number, number, number] = [0, 0, 0, 0];
    const d = processLogoPixels(px(white, edge, none, none, none, none));
    expect(gray(d, 1)).toBeGreaterThan(gray(d, 0));
    expect(gray(d, 1)).toBeLessThan(gray(d, 2));
  });

  it("glifo OSCURO sobre transparente → sigue oscuro (no se invierte)", () => {
    const dark: [number, number, number, number] = [10, 10, 10, 255];
    const none: [number, number, number, number] = [0, 0, 0, 0];
    const d = processLogoPixels(px(dark, dark, none, none, none, none));
    expect(gray(d, 0)).toBeLessThan(60);
    expect(gray(d, 2)).toBe(255);
  });

  it("imagen OPACA con fondo claro NO se invierte", () => {
    const light: [number, number, number, number] = [250, 250, 250, 255];
    const dark: [number, number, number, number] = [20, 20, 20, 255];
    const d = processLogoPixels(px(light, light, light, light, light, light, light, light, light, dark));
    expect(gray(d, 0)).toBeGreaterThan(200); // fondo sigue claro
    expect(gray(d, 9)).toBeLessThan(60); // trazo sigue oscuro
  });

  it("totalmente transparente → todo blanco y opaco", () => {
    const d = processLogoPixels(px([0, 0, 0, 0], [12, 34, 56, 0]));
    expect([gray(d, 0), gray(d, 1)]).toEqual([255, 255]);
    expect([alpha(d, 0), alpha(d, 1)]).toEqual([255, 255]);
  });

  it("devuelve en escala de grises (R=G=B)", () => {
    const d = processLogoPixels(px([200, 30, 90, 255], [10, 200, 40, 255]));
    for (let i = 0; i < 2; i++) {
      expect(d[i * 4]).toBe(d[i * 4 + 1]);
      expect(d[i * 4 + 1]).toBe(d[i * 4 + 2]);
    }
  });
});

describe("prepareTicketLogo", () => {
  const URL_ = "https://cdn.example.com/logo.png";
  const DATA = "data:image/png;base64,AAAA";

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetchOk() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["x"], { type: "image/png" }),
      }),
    );
  }

  /** Image falsa que "carga" al asignar src, con el tamaño natural dado. */
  function stubImage(naturalWidth: number, naturalHeight: number) {
    class FakeImage {
      naturalWidth = naturalWidth;
      naturalHeight = naturalHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
  }

  /** Canvas falso cuyo contexto entrega el ImageData dado. */
  function stubCanvas(data: Uint8ClampedArray) {
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data })),
      putImageData: vi.fn(),
    };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx), toDataURL: vi.fn(() => DATA) };
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? canvas : real(tag)) as typeof document.createElement);
    return { canvas, ctx };
  }

  it("fetch rechazado → devuelve la URL original", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS")));
    await expect(prepareTicketLogo(URL_)).resolves.toBe(URL_);
  });

  it("respuesta no-ok → devuelve la URL original", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, blob: async () => new Blob() }));
    await expect(prepareTicketLogo(URL_)).resolves.toBe(URL_);
  });

  it("si tarda más de ~3 s → devuelve la URL original sin bloquear", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const p = prepareTicketLogo(URL_);
    await vi.advanceTimersByTimeAsync(3100);
    await expect(p).resolves.toBe(URL_);
  });

  it("sin canvas 2D (jsdom) → devuelve la URL original", async () => {
    stubFetchOk();
    stubImage(100, 50);
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => null), toDataURL: vi.fn() };
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? canvas : real(tag)) as typeof document.createElement);
    await expect(prepareTicketLogo(URL_)).resolves.toBe(URL_);
  });

  it("pipeline OK → data:image/png con los píxeles procesados", async () => {
    stubFetchOk();
    stubImage(100, 50);
    // glifo blanco + transparente → debe quedar oscuro al volcarse al canvas
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const { ctx } = stubCanvas(data);

    const out = await prepareTicketLogo(URL_);

    expect(out).toBe(DATA);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(data[0]).toBeLessThan(60);
    expect(data[4]).toBe(255);
  });

  it("escala a ancho máx. 320 px manteniendo proporción, sin agrandar", async () => {
    stubFetchOk();
    stubImage(640, 320);
    const big = stubCanvas(new Uint8ClampedArray(4));
    await prepareTicketLogo(URL_);
    expect([big.canvas.width, big.canvas.height]).toEqual([320, 160]);

    vi.restoreAllMocks();
    stubFetchOk();
    stubImage(100, 50);
    const small = stubCanvas(new Uint8ClampedArray(4));
    await prepareTicketLogo(URL_);
    expect([small.canvas.width, small.canvas.height]).toEqual([100, 50]);
  });
});

describe("prepareTicketLogoBitmap", () => {
  const URL_ = "https://cdn.example.com/logo.png";

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubPipeline(naturalWidth: number, naturalHeight: number, data: Uint8ClampedArray) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }),
    );
    class FakeImage {
      naturalWidth = naturalWidth;
      naturalHeight = naturalHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data })), putImageData: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx), toDataURL: vi.fn() };
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? canvas : real(tag)) as typeof document.createElement);
    return canvas;
  }

  it("pipeline OK → bitmap RGBA procesado (glifo claro oscurecido) con el tamaño del canvas", async () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    stubPipeline(100, 50, data);

    const bmp = await prepareTicketLogoBitmap(URL_);

    expect(bmp).not.toBeNull();
    expect([bmp!.width, bmp!.height]).toEqual([100, 50]);
    expect(bmp!.data[0]).toBeLessThan(60);
    expect(bmp!.data[4]).toBe(255);
  });

  it("limita también el alto (160 px) manteniendo proporción", async () => {
    const canvas = stubPipeline(320, 640, new Uint8ClampedArray(4));
    await prepareTicketLogoBitmap(URL_);
    expect([canvas.width, canvas.height]).toEqual([80, 160]);
  });

  it("fetch rechazado → null (nunca lanza)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS")));
    await expect(prepareTicketLogoBitmap(URL_)).resolves.toBeNull();
  });

  it("si tarda más de ~3 s → null sin bloquear", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const p = prepareTicketLogoBitmap(URL_);
    await vi.advanceTimersByTimeAsync(3100);
    await expect(p).resolves.toBeNull();
  });
});
