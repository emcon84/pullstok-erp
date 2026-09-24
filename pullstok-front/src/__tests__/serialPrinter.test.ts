import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSerialPrintingSupported,
  getConnectedPrinterPort,
  connectPrinter,
  printBytes,
  disconnectPrinter,
  PRINTER_STORAGE_KEY,
  PRINT_TIMEOUT_MS,
  BAUD_STORAGE_KEY,
  SUPPORTED_BAUD_RATES,
  DEFAULT_BAUD_RATE,
  getPrinterBaudRate,
  setPrinterBaudRate,
  probePrinterBaudRates,
  estimateDrainMs,
} from "@/utils/serialPrinter";
import { encodeBaudProbeEscPos, encodeTestTicketEscPos } from "@/utils/escpos";

// Transporte Web Serial: se mockea `navigator.serial` completo (no hay hardware
// ni permisos de Chrome en jsdom).

interface MockPortOptions {
  info?: { usbVendorId?: number; usbProductId?: number };
  writeImpl?: (chunk: Uint8Array) => Promise<void>;
  openImpl?: (options: { baudRate: number }) => Promise<void>;
  noForget?: boolean;
}

function makePort(o: MockPortOptions = {}) {
  const written: Uint8Array[] = [];
  const writer = {
    write: vi.fn(async (chunk: Uint8Array) => {
      if (o.writeImpl) await o.writeImpl(chunk);
      written.push(chunk);
    }),
    releaseLock: vi.fn(),
    abort: vi.fn(async () => {}),
  };
  const port = {
    open: vi.fn(o.openImpl ?? (async () => {})),
    close: vi.fn(async () => {}),
    getInfo: vi.fn(() => o.info ?? {}),
    writable: { getWriter: vi.fn(() => writer) },
    ...(o.noForget ? {} : { forget: vi.fn(async () => {}) }),
  };
  return { port, writer, written };
}

function installSerial(ports: ReturnType<typeof makePort>[], requested?: ReturnType<typeof makePort> | Error) {
  const serial = {
    getPorts: vi.fn(async () => ports.map((p) => p.port)),
    requestPort: vi.fn(async () => {
      if (requested instanceof Error) throw requested;
      if (!requested) throw new Error("no requested");
      return requested.port;
    }),
  };
  Object.defineProperty(navigator, "serial", { value: serial, configurable: true });
  return serial;
}

const domError = (name: string, message = name) => {
  const e = new Error(message);
  e.name = name;
  return e;
};

const flat = (chunks: Uint8Array[]) => Uint8Array.from(chunks.flatMap((c) => Array.from(c)));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete (navigator as unknown as { serial?: unknown }).serial;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isSerialPrintingSupported", () => {
  it("false sin navigator.serial", () => {
    expect(isSerialPrintingSupported()).toBe(false);
  });

  it("true con navigator.serial", () => {
    installSerial([]);
    expect(isSerialPrintingSupported()).toBe(true);
  });

  it("false en contexto no seguro", () => {
    installSerial([]);
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    try {
      expect(isSerialPrintingSupported()).toBe(false);
    } finally {
      delete (window as unknown as { isSecureContext?: unknown }).isSecureContext;
    }
  });
});

describe("getConnectedPrinterPort", () => {
  it("null si no está soportado", async () => {
    expect(await getConnectedPrinterPort()).toBeNull();
  });

  it("null si no hay puertos recordados", async () => {
    installSerial([]);
    expect(await getConnectedPrinterPort()).toBeNull();
  });

  it("null si getPorts lanza", async () => {
    const serial = installSerial([]);
    serial.getPorts.mockRejectedValue(new Error("boom"));
    expect(await getConnectedPrinterPort()).toBeNull();
  });

  it("con varios, prefiere el que coincide con lo guardado (vendor/product)", async () => {
    const a = makePort({ info: { usbVendorId: 1, usbProductId: 1 } });
    const b = makePort({ info: { usbVendorId: 0x0416, usbProductId: 0x5011 } });
    installSerial([a, b]);
    localStorage.setItem(
      PRINTER_STORAGE_KEY,
      JSON.stringify({ usbVendorId: 0x0416, usbProductId: 0x5011 }),
    );
    expect(await getConnectedPrinterPort()).toBe(b.port);
  });

  it("sin coincidencia (o sin guardado) toma el primero", async () => {
    const a = makePort({ info: { usbVendorId: 1, usbProductId: 1 } });
    const b = makePort({ info: { usbVendorId: 2, usbProductId: 2 } });
    installSerial([a, b]);
    expect(await getConnectedPrinterPort()).toBe(a.port);
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify({ usbVendorId: 9, usbProductId: 9 }));
    expect(await getConnectedPrinterPort()).toBe(a.port);
  });

  it("localStorage roto o con basura no impide devolver el primero", async () => {
    const a = makePort();
    installSerial([a]);
    localStorage.setItem(PRINTER_STORAGE_KEY, "{no es json");
    expect(await getConnectedPrinterPort()).toBe(a.port);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });
    expect(await getConnectedPrinterPort()).toBe(a.port);
  });
});

describe("connectPrinter", () => {
  it("unsupported si el navegador no tiene Web Serial", async () => {
    expect(await connectPrinter()).toEqual({ ok: false, reason: "unsupported" });
  });

  it("cancelled si el usuario cierra el selector (NotFoundError)", async () => {
    installSerial([], domError("NotFoundError", "No port selected by the user."));
    expect(await connectPrinter()).toEqual({ ok: false, reason: "cancelled" });
  });

  it("error con mensaje si requestPort falla por otra causa", async () => {
    installSerial([], domError("SecurityError", "sin gesto de usuario"));
    const r = await connectPrinter();
    expect(r).toMatchObject({ ok: false, reason: "error" });
    expect((r as { message?: string }).message).toContain("sin gesto de usuario");
  });

  it("ok: guarda el puerto y escribe el ticket de prueba", async () => {
    const p = makePort({ info: { usbVendorId: 7, usbProductId: 8 } });
    installSerial([], p);
    expect(await connectPrinter()).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem(PRINTER_STORAGE_KEY)!)).toEqual({
      usbVendorId: 7,
      usbProductId: 8,
    });
    expect(Array.from(flat(p.written))).toEqual(Array.from(encodeTestTicketEscPos()));
    expect(p.port.close).toHaveBeenCalled();
  });

  it("ok aunque localStorage no esté disponible", async () => {
    const p = makePort();
    installSerial([], p);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    expect(await connectPrinter()).toEqual({ ok: true });
  });

  it("si la prueba falla: error, y el puerto se olvida (no queda 'conectado' uno que no anda)", async () => {
    const p = makePort({
      info: { usbVendorId: 7, usbProductId: 8 },
      writeImpl: async () => {
        throw new Error("puerto equivocado");
      },
    });
    installSerial([], p);
    const r = await connectPrinter();
    expect(r).toMatchObject({ ok: false, reason: "error" });
    expect((r as { message?: string }).message).toContain("puerto equivocado");
    expect(p.port.forget).toHaveBeenCalled();
    expect(localStorage.getItem(PRINTER_STORAGE_KEY)).toBeNull();
  });
});

describe("printBytes", () => {
  it("rechaza si no hay impresora conectada", async () => {
    installSerial([]);
    await expect(printBytes(new Uint8Array([1]))).rejects.toThrow(/impresora/i);
  });

  it("rechaza si no está soportado", async () => {
    await expect(printBytes(new Uint8Array([1]))).rejects.toThrow();
  });

  it("abre a 9600, escribe en chunks de a lo sumo 512 bytes, libera y cierra", async () => {
    const p = makePort();
    installSerial([p]);
    const bytes = Uint8Array.from({ length: 1300 }, (_, i) => i % 251);

    vi.useFakeTimers(); // el drenaje del buffer espera ~1,8 s a 9600
    const printing = printBytes(bytes);
    await vi.runAllTimersAsync();
    await printing;

    expect(p.port.open).toHaveBeenCalledWith({ baudRate: 9600 });
    expect(p.written.map((c) => c.length)).toEqual([512, 512, 276]);
    expect(Array.from(flat(p.written))).toEqual(Array.from(bytes));
    expect(p.writer.releaseLock).toHaveBeenCalledTimes(1);
    expect(p.port.close).toHaveBeenCalledTimes(1);
  });

  it("si write lanza: rechaza con mensaje claro, igual libera el lock y cierra el puerto", async () => {
    const p = makePort({
      writeImpl: async () => {
        throw new Error("Bluetooth desconectado");
      },
    });
    installSerial([p]);

    await expect(printBytes(new Uint8Array([1, 2, 3]))).rejects.toThrow(/Bluetooth desconectado/);
    expect(p.writer.releaseLock).toHaveBeenCalledTimes(1);
    expect(p.port.close).toHaveBeenCalledTimes(1);
  });

  it("tolera un puerto ya abierto (InvalidStateError) y escribe igual", async () => {
    const p = makePort({
      openImpl: async () => {
        throw domError("InvalidStateError", "The port is already open.");
      },
    });
    installSerial([p]);

    await printBytes(new Uint8Array([1, 2, 3]));
    expect(Array.from(flat(p.written))).toEqual([1, 2, 3]);
    expect(p.writer.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("si open falla por otra causa: rechaza y no intenta escribir", async () => {
    const p = makePort({
      openImpl: async () => {
        throw domError("NetworkError", "Failed to open serial port.");
      },
    });
    installSerial([p]);

    await expect(printBytes(new Uint8Array([1]))).rejects.toThrow(/Failed to open/);
    expect(p.writer.write).not.toHaveBeenCalled();
  });

  it("timeout: nunca cuelga el POS; rechaza y aborta el writer", async () => {
    vi.useFakeTimers();
    const p = makePort({ writeImpl: () => new Promise<void>(() => {}) }); // nunca resuelve
    installSerial([p]);

    const result = printBytes(new Uint8Array([1, 2, 3])).then(
      () => "ok",
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS + estimateDrainMs(3, 9600) + 50);

    expect(await result).toMatch(/tiempo/i);
    expect(p.writer.abort).toHaveBeenCalled();
  });

  it("dos impresiones seguidas no se pisan (se encolan)", async () => {
    const p = makePort();
    installSerial([p]);
    await Promise.all([printBytes(new Uint8Array([1])), printBytes(new Uint8Array([2]))]);
    expect(p.port.open).toHaveBeenCalledTimes(2);
    expect(p.writer.releaseLock).toHaveBeenCalledTimes(2);
    expect(p.port.close).toHaveBeenCalledTimes(2);
    expect(p.written.map((c) => Array.from(c))).toEqual([[1], [2]]);
  });
});

describe("disconnectPrinter", () => {
  it("olvida el puerto (forget) y limpia lo guardado", async () => {
    const p = makePort();
    installSerial([p]);
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify({ usbVendorId: 1 }));

    await disconnectPrinter();

    expect(p.port.forget).toHaveBeenCalled();
    expect(localStorage.getItem(PRINTER_STORAGE_KEY)).toBeNull();
  });

  it("sin forget() (Chrome viejo) igual limpia lo guardado y no lanza", async () => {
    const p = makePort({ noForget: true });
    installSerial([p]);
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify({ usbVendorId: 1 }));

    await expect(disconnectPrinter()).resolves.toBeUndefined();
    expect(localStorage.getItem(PRINTER_STORAGE_KEY)).toBeNull();
  });

  it("sin soporte no lanza", async () => {
    await expect(disconnectPrinter()).resolves.toBeUndefined();
  });
});

describe("baud rate configurable", () => {
  it("expone las velocidades soportadas y 9600 por defecto", () => {
    expect(SUPPORTED_BAUD_RATES).toEqual([9600, 19200, 38400, 57600, 115200]);
    expect(DEFAULT_BAUD_RATE).toBe(9600);
    expect(getPrinterBaudRate()).toBe(9600);
  });

  it("setPrinterBaudRate persiste en localStorage y getPrinterBaudRate lo lee", () => {
    setPrinterBaudRate(115200);
    expect(localStorage.getItem(BAUD_STORAGE_KEY)).toBe("115200");
    expect(getPrinterBaudRate()).toBe(115200);
  });

  it("ignora velocidades que no están en la lista", () => {
    setPrinterBaudRate(19200);
    setPrinterBaudRate(1234);
    setPrinterBaudRate(Number.NaN);
    expect(getPrinterBaudRate()).toBe(19200);
  });

  it("un valor guardado inválido o basura vuelve al valor por defecto", () => {
    localStorage.setItem(BAUD_STORAGE_KEY, "abc");
    expect(getPrinterBaudRate()).toBe(9600);
    localStorage.setItem(BAUD_STORAGE_KEY, "1234");
    expect(getPrinterBaudRate()).toBe(9600);
  });

  it("sin storage disponible no lanza y usa 9600", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    expect(getPrinterBaudRate()).toBe(9600);
    expect(() => setPrinterBaudRate(19200)).not.toThrow();
  });

  it("printBytes abre el puerto con la velocidad guardada", async () => {
    const p = makePort();
    installSerial([p]);
    setPrinterBaudRate(57600);
    await printBytes(new Uint8Array([1]));
    expect(p.port.open).toHaveBeenCalledWith({ baudRate: 57600 });
  });

  it("printBytes acepta una velocidad explícita que pisa la guardada sin cambiarla", async () => {
    const p = makePort();
    installSerial([p]);
    setPrinterBaudRate(57600);
    await printBytes(new Uint8Array([1]), 19200);
    expect(p.port.open).toHaveBeenCalledWith({ baudRate: 19200 });
    expect(getPrinterBaudRate()).toBe(57600);
  });

  it("connectPrinter también usa la velocidad guardada", async () => {
    const p = makePort();
    installSerial([], p);
    setPrinterBaudRate(38400);
    expect(await connectPrinter()).toEqual({ ok: true });
    expect(p.port.open).toHaveBeenCalledWith({ baudRate: 38400 });
  });
});

describe("probePrinterBaudRates", () => {
  // Solo se falsea setTimeout: las promesas (getPorts, open...) siguen normales.
  const run = async (onProgress?: Parameters<typeof probePrinterBaudRates>[0]) => {
    vi.useFakeTimers();
    const promise = probePrinterBaudRates(onProgress);
    await vi.runAllTimersAsync();
    return promise;
  };

  it("recorre las 5 velocidades en orden, manda un ticket rotulado y cierra el puerto en cada una", async () => {
    const p = makePort();
    installSerial([p]);

    const results = await run();

    expect(results).toEqual(SUPPORTED_BAUD_RATES.map((baud) => ({ baud, ok: true })));
    expect(p.port.open.mock.calls.map((c) => c[0])).toEqual(
      SUPPORTED_BAUD_RATES.map((baudRate) => ({ baudRate })),
    );
    const expected = SUPPORTED_BAUD_RATES.flatMap((b) => Array.from(encodeBaudProbeEscPos(b)));
    expect(Array.from(flat(p.written))).toEqual(expected);
    expect(p.port.close).toHaveBeenCalledTimes(5);
    expect(p.writer.releaseLock).toHaveBeenCalledTimes(5);
  });

  it("no cambia la velocidad guardada", async () => {
    installSerial([makePort()]);
    setPrinterBaudRate(19200);
    await run();
    expect(getPrinterBaudRate()).toBe(19200);
  });

  it("espera ~1,5 s (tras el drenaje) entre velocidades", async () => {
    const p = makePort();
    installSerial([p]);
    vi.useFakeTimers();
    const drain = estimateDrainMs(encodeBaudProbeEscPos(9600).length, 9600);
    const promise = probePrinterBaudRates();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(p.port.open).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(drain + 1400);
      expect(p.port.open).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(300);
      expect(p.port.open).toHaveBeenCalledTimes(2);
    } finally {
      await vi.runAllTimersAsync(); // que la cola (global) no quede colgada si falla un expect
      await promise;
    }
  });

  it("si una velocidad falla sigue con las demás y nunca lanza", async () => {
    const p = makePort({
      openImpl: async ({ baudRate }) => {
        if (baudRate === 38400) throw domError("NetworkError", "Failed to open serial port.");
      },
    });
    installSerial([p]);

    const results = await run();

    expect(results.map((r) => r.baud)).toEqual([...SUPPORTED_BAUD_RATES]);
    expect(results.map((r) => r.ok)).toEqual([true, true, false, true, true]);
    expect(results[2].message).toMatch(/Failed to open/);
    expect(p.port.open).toHaveBeenCalledTimes(5);
  });

  it("sin impresora conectada devuelve todo en falla sin lanzar", async () => {
    installSerial([]);
    const results = await run();
    expect(results).toHaveLength(5);
    expect(results.every((r) => !r.ok && /impresora/i.test(r.message ?? ""))).toBe(true);
  });

  it("sin soporte de Web Serial tampoco lanza", async () => {
    const results = await run();
    expect(results.every((r) => !r.ok)).toBe(true);
  });

  it("avisa el progreso antes de cada velocidad", async () => {
    installSerial([makePort()]);
    const seen: number[] = [];
    await run((baud) => seen.push(baud));
    expect(seen).toEqual([...SUPPORTED_BAUD_RATES]);
  });

  it("un puerto colgado no cuelga la sonda: timeout por velocidad y sigue", async () => {
    const p = makePort({ writeImpl: () => new Promise<void>(() => {}) });
    installSerial([p]);
    const results = await run();
    expect(results.every((r) => !r.ok && /tiempo/i.test(r.message ?? ""))).toBe(true);
    expect(results).toHaveLength(5);
  });

  it("se serializa con otras impresiones: no se pisa con printBytes", async () => {
    const p = makePort();
    installSerial([p]);
    vi.useFakeTimers();
    const probe = probePrinterBaudRates();
    const print = printBytes(new Uint8Array([9]));
    await vi.runAllTimersAsync();
    await Promise.all([probe, print]);
    // El ticket suelto queda al final: entró a la cola después de toda la sonda.
    const lastOpen = p.port.open.mock.calls[p.port.open.mock.calls.length - 1][0];
    expect(lastOpen).toEqual({ baudRate: 9600 });
    expect(p.written[p.written.length - 1]).toEqual(Uint8Array.from([9]));
    expect(p.port.open).toHaveBeenCalledTimes(6);
  });
});

describe("estimateDrainMs", () => {
  it("4000 bytes a 9600 baudios: ~4,8 s de transmisión + colchón (≈ 5 s)", () => {
    const ms = estimateDrainMs(4000, 9600);
    expect(ms).toBeGreaterThanOrEqual(4800);
    expect(ms).toBeLessThan(5200);
  });

  it("pocos bytes a 115200: casi solo el colchón de 250 ms", () => {
    const ms = estimateDrainMs(100, 115200);
    expect(ms).toBeGreaterThanOrEqual(250);
    expect(ms).toBeLessThanOrEqual(300);
  });

  it("tiene tope de 8 s", () => {
    expect(estimateDrainMs(100_000, 9600)).toBe(8000);
  });

  it("crece con los bytes y baja con la velocidad", () => {
    expect(estimateDrainMs(2000, 9600)).toBeGreaterThan(estimateDrainMs(1000, 9600));
    expect(estimateDrainMs(2000, 115200)).toBeLessThan(estimateDrainMs(2000, 9600));
  });

  it("entradas raras no dan NaN ni negativos", () => {
    for (const ms of [estimateDrainMs(0, 9600), estimateDrainMs(10, 0), estimateDrainMs(-5, Number.NaN)]) {
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(250);
      expect(ms).toBeLessThanOrEqual(8000);
    }
  });
});

describe("printBytes: espera el drenaje del buffer antes de cerrar", () => {
  it("no cierra el puerto ni suelta el lock hasta que pasó el tiempo de drenaje", async () => {
    vi.useFakeTimers();
    const p = makePort();
    installSerial([p]);
    const bytes = new Uint8Array(100);
    const drain = estimateDrainMs(bytes.length, 9600); // ≈ 370 ms

    let done = false;
    const printing = printBytes(bytes).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(drain - 100);
    expect(p.written).toHaveLength(1); // ya se escribió todo...
    expect(p.port.close).not.toHaveBeenCalled(); // ...pero los bytes siguen saliendo por el UART
    expect(p.writer.releaseLock).not.toHaveBeenCalled();
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    await printing;
    expect(p.port.close).toHaveBeenCalledTimes(1);
    expect(p.writer.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("el drenaje usa la velocidad efectiva (override): a 115200 cierra mucho antes", async () => {
    vi.useFakeTimers();
    const p = makePort();
    installSerial([p]);
    const bytes = new Uint8Array(1000);
    const printing = printBytes(bytes, 115200);
    await vi.advanceTimersByTimeAsync(estimateDrainMs(1000, 115200) + 60); // 2 chunks = 20 ms de pausa
    await printing;
    expect(p.port.close).toHaveBeenCalledTimes(1);
    expect(estimateDrainMs(1000, 115200)).toBeLessThan(estimateDrainMs(1000, 9600) / 2);
  });

  it("el timeout suma el drenaje: un puerto colgado rechaza a los 10 s + drenaje, no antes", async () => {
    vi.useFakeTimers();
    const p = makePort({ writeImpl: () => new Promise<void>(() => {}) });
    installSerial([p]);
    const bytes = new Uint8Array(4000);
    const limit = PRINT_TIMEOUT_MS + estimateDrainMs(bytes.length, 9600);

    let msg = "";
    const printing = printBytes(bytes).catch((e: Error) => {
      msg = e.message;
    });
    await vi.advanceTimersByTimeAsync(limit - 100);
    expect(msg).toBe("");
    await vi.advanceTimersByTimeAsync(200);
    await printing;
    expect(msg).toMatch(/tiempo/i);
    expect(p.writer.abort).toHaveBeenCalled();
  });
});
