import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSerialPrintingSupported,
  getConnectedPrinterPort,
  connectPrinter,
  printBytes,
  disconnectPrinter,
  PRINTER_STORAGE_KEY,
  PRINT_TIMEOUT_MS,
} from "@/utils/serialPrinter";
import { encodeTestTicketEscPos } from "@/utils/escpos";

// Transporte Web Serial: se mockea `navigator.serial` completo (no hay hardware
// ni permisos de Chrome en jsdom).

interface MockPortOptions {
  info?: { usbVendorId?: number; usbProductId?: number };
  writeImpl?: (chunk: Uint8Array) => Promise<void>;
  openImpl?: () => Promise<void>;
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

    await printBytes(bytes);

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
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS + 50);

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
