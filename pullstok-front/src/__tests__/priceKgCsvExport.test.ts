import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadScaleCsv } from "@/services/priceKgPlan";

describe("downloadScaleCsv — descarga del CSV de códigos de balanza", () => {
  const createObjectURL = vi.fn(() => "blob:mock");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    localStorage.setItem("token", "tok");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("consume el endpoint con el token y dispara la descarga con el nombre del header", async () => {
    const blob = new Blob(["SUELTO;0101;A;0101;1,00;0,00;peso;0;"], {
      type: "text/csv",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
      headers: { get: () => 'attachment; filename="scale-codes-qendra.csv"' },
    });
    vi.stubGlobal("fetch", fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => node);

    const filename = await downloadScaleCsv();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/price-kg-plan/codes/csv"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
    expect(filename).toBe("scale-codes-qendra.csv");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
  });

  it("lanza el mensaje del backend cuando la respuesta no es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: "No autorizado" }),
      }),
    );

    await expect(downloadScaleCsv()).rejects.toThrow("No autorizado");
  });

  it("usa el nombre por defecto si falta el Content-Disposition", async () => {
    const blob = new Blob(["SUELTO;0101;A;0101;1,00;0,00;peso;0;"], { type: "text/csv" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(blob),
        headers: { get: () => null },
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);

    const filename = await downloadScaleCsv();

    expect(filename).toBe("scale-codes-qendra.csv");
  });
});
