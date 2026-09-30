import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
  },
}));

import {
  createPairingCode,
  createPrinter,
  deletePrinter,
  getPrintAgents,
  getPrinters,
  updatePrinter,
} from "../services/printerService";

const headers = { headers: { Authorization: "Bearer tok-1" } };
const axiosError = (data: unknown) => ({ isAxiosError: true, response: { data } });

describe("printerService (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "tok-1");
  });

  it("getPrinters GETs /printers with the Bearer token", async () => {
    mockGet.mockResolvedValue({ data: [{ id: "p1", name: "Caja", agentOnline: true }] });
    const res = await getPrinters();
    expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/\/printers$/), headers);
    expect(res[0].name).toBe("Caja");
  });

  it("getPrintAgents GETs /printers/agents", async () => {
    mockGet.mockResolvedValue({ data: [{ id: "a1", name: "PC caja", online: true, paired: true, localPrinters: ["OCOM 58"] }] });
    const res = await getPrintAgents();
    expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/\/printers\/agents$/), headers);
    expect(res[0].localPrinters).toEqual(["OCOM 58"]);
  });

  it("createPrinter POSTs the payload", async () => {
    mockPost.mockResolvedValue({ data: { id: "p1" } });
    await createPrinter({ name: "Caja", branchId: "b1", agentId: "a1", localName: "OCOM 58" });
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/printers$/),
      { name: "Caja", branchId: "b1", agentId: "a1", localName: "OCOM 58" },
      headers,
    );
  });

  it("updatePrinter PUTs /printers/:id", async () => {
    mockPut.mockResolvedValue({ data: { id: "p1" } });
    await updatePrinter("p1", { isActive: false });
    expect(mockPut).toHaveBeenCalledWith(expect.stringMatching(/\/printers\/p1$/), { isActive: false }, headers);
  });

  it("deletePrinter DELETEs /printers/:id", async () => {
    mockDelete.mockResolvedValue({ data: {} });
    await deletePrinter("p1");
    expect(mockDelete).toHaveBeenCalledWith(expect.stringMatching(/\/printers\/p1$/), headers);
  });

  it("createPairingCode POSTs the agent name and returns the code", async () => {
    mockPost.mockResolvedValue({ data: { agentId: "a1", code: "ABCDE-12345", expiresAt: "2026-09-30T12:10:00Z" } });
    const res = await createPairingCode("PC caja");
    expect(mockPost).toHaveBeenCalledWith(expect.stringMatching(/\/printers\/pairing-codes$/), { name: "PC caja" }, headers);
    expect(res.code).toBe("ABCDE-12345");
  });

  it("surfaces the backend message on errors", async () => {
    mockPost.mockRejectedValue(axiosError({ message: "Ya existe una impresora con ese nombre" }));
    await expect(createPrinter({ name: "Caja" })).rejects.toThrow("Ya existe una impresora con ese nombre");
  });
});
