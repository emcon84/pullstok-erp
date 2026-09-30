import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const confirmMock = vi.fn();
vi.mock("@/components/hooks/useConfirm", () => ({
  useConfirm: () => confirmMock,
}));
vi.mock("@/services/printerService", () => ({
  getPrinters: vi.fn(),
  getPrintAgents: vi.fn(),
  createPrinter: vi.fn(),
  updatePrinter: vi.fn(),
  deletePrinter: vi.fn(),
  createPairingCode: vi.fn(),
}));
vi.mock("@/services/branchService", () => ({ getBranches: vi.fn() }));
vi.mock("@/utils/directPrintAgent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/directPrintAgent")>();
  return { ...actual, pairAgent: vi.fn() };
});

import {
  createPairingCode,
  createPrinter,
  deletePrinter,
  getPrintAgents,
  getPrinters,
  updatePrinter,
} from "@/services/printerService";
import { getBranches } from "@/services/branchService";
import { DirectPrintAgentError, pairAgent } from "@/utils/directPrintAgent";
import { PrintersPage } from "@/views/PrintersPage";

const printers = [
  {
    id: "p1",
    name: "Caja 1",
    branchId: "b1",
    agentId: "a1",
    localName: "OCOM 58",
    isActive: true,
    agentOnline: true,
    agent: { id: "a1", name: "PC caja", lastSeenAt: "2026-09-30T12:00:00Z", localPrinters: ["OCOM 58", "PDF"] },
  },
  {
    id: "p2",
    name: "Depósito",
    branchId: null,
    agentId: null,
    localName: null,
    isActive: false,
    agentOnline: false,
    agent: null,
  },
];
const agents = [
  { id: "a1", name: "PC caja", lastSeenAt: "2026-09-30T12:00:00Z", localPrinters: ["OCOM 58", "PDF"], paired: true, online: true },
];
const branches = [{ id: "b1", name: "Centro", isActive: true, createdAt: "2026-01-01" }];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PrintersPage />
    </QueryClientProvider>,
  );
}

describe("PrintersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrinters).mockResolvedValue(printers as never);
    vi.mocked(getPrintAgents).mockResolvedValue(agents as never);
    vi.mocked(getBranches).mockResolvedValue(branches as never);
    confirmMock.mockResolvedValue(true);
  });

  it("lista las impresoras con estado en línea, sucursal e impresora de Windows", async () => {
    renderPage();
    const caja = (await screen.findByText("Caja 1")).closest("[data-testid='printer-row']") as HTMLElement;
    expect(within(caja).getByText(/en línea/i)).toBeInTheDocument();
    expect(within(caja).getByText(/Centro/)).toBeInTheDocument();
    expect(within(caja).getByText(/OCOM 58/)).toBeInTheDocument();
    const dep = screen.getByText("Depósito").closest("[data-testid='printer-row']") as HTMLElement;
    expect(within(dep).getByText(/sin conexión/i)).toBeInTheDocument();
    expect(within(dep).getByText(/desactivada/i)).toBeInTheDocument();
  });

  it("estado vacío cuando no hay impresoras", async () => {
    vi.mocked(getPrinters).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/todavía no hay impresoras/i)).toBeInTheDocument();
  });

  it("crea una impresora mapeada a un equipo, su impresora local y una sucursal", async () => {
    vi.mocked(createPrinter).mockResolvedValue({ id: "p3" } as never);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /nueva impresora/i }));
    fireEvent.change(screen.getByLabelText(/^nombre/i), { target: { value: "Caja 2" } });
    fireEvent.change(screen.getByLabelText(/sucursal/i), { target: { value: "b1" } });
    fireEvent.change(screen.getByLabelText(/equipo/i), { target: { value: "a1" } });
    // Las impresoras locales salen del latido del agente elegido.
    fireEvent.change(screen.getByLabelText(/impresora de windows/i), { target: { value: "PDF" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(createPrinter).toHaveBeenCalledWith({
        name: "Caja 2",
        branchId: "b1",
        agentId: "a1",
        localName: "PDF",
        isActive: true,
      }),
    );
  });

  it("no permite guardar sin nombre", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /nueva impresora/i }));
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
  });

  it("edita una impresora existente", async () => {
    vi.mocked(updatePrinter).mockResolvedValue({ id: "p1" } as never);
    renderPage();
    const row = (await screen.findByText("Caja 1")).closest("[data-testid='printer-row']") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /editar/i }));
    const name = screen.getByLabelText(/^nombre/i) as HTMLInputElement;
    expect(name.value).toBe("Caja 1");
    fireEvent.change(name, { target: { value: "Caja principal" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(updatePrinter).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Caja principal", agentId: "a1", localName: "OCOM 58" })),
    );
  });

  it("activa/desactiva con el switch", async () => {
    vi.mocked(updatePrinter).mockResolvedValue({ id: "p1" } as never);
    renderPage();
    const row = (await screen.findByText("Caja 1")).closest("[data-testid='printer-row']") as HTMLElement;
    fireEvent.click(within(row).getByRole("switch"));
    await waitFor(() => expect(updatePrinter).toHaveBeenCalledWith("p1", { isActive: false }));
  });

  it("elimina con confirmación", async () => {
    vi.mocked(deletePrinter).mockResolvedValue(undefined);
    renderPage();
    const row = (await screen.findByText("Caja 1")).closest("[data-testid='printer-row']") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /eliminar/i }));
    await waitFor(() => expect(deletePrinter).toHaveBeenCalledWith("p1"));
    expect(confirmMock).toHaveBeenCalled();
  });

  it("no elimina si se cancela la confirmación", async () => {
    confirmMock.mockResolvedValue(false);
    renderPage();
    const row = (await screen.findByText("Caja 1")).closest("[data-testid='printer-row']") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /eliminar/i }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(deletePrinter).not.toHaveBeenCalled();
  });

  describe("Emparejar este equipo", () => {
    const openDialog = async () => {
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: /emparejar este equipo/i }));
      fireEvent.change(screen.getByLabelText(/nombre del equipo/i), { target: { value: "PC caja" } });
      fireEvent.click(screen.getByRole("button", { name: /generar código/i }));
    };

    it("genera el código y lo manda solo al agente local", async () => {
      vi.mocked(createPairingCode).mockResolvedValue({ agentId: "a9", code: "ABCDE-12345", expiresAt: "2026-09-30T12:10:00Z" });
      vi.mocked(pairAgent).mockResolvedValue({ ok: true, agentId: "a9", name: "PC caja" });
      await openDialog();
      await waitFor(() => expect(pairAgent).toHaveBeenCalledWith("ABCDE-12345"));
      expect(createPairingCode).toHaveBeenCalledWith("PC caja");
      expect(await screen.findByText(/este equipo quedó emparejado/i)).toBeInTheDocument();
      expect(screen.getByText("ABCDE-12345")).toBeInTheDocument();
    });

    it("si el agente local no responde, muestra el código para usarlo a mano", async () => {
      vi.mocked(createPairingCode).mockResolvedValue({ agentId: "a9", code: "ABCDE-12345", expiresAt: "2026-09-30T12:10:00Z" });
      vi.mocked(pairAgent).mockRejectedValue(new DirectPrintAgentError("No se pudo conectar con el agente de impresión"));
      await openDialog();
      expect(await screen.findByText("ABCDE-12345")).toBeInTheDocument();
      expect(await screen.findByText(/no se pudo conectar con el agente/i)).toBeInTheDocument();
      expect(screen.getByText(/vence en 10 minutos/i)).toBeInTheDocument();
    });

    it("si el backend falla al generar el código, avisa y no toca el agente", async () => {
      vi.mocked(createPairingCode).mockRejectedValue(new Error("Error al generar el código"));
      await openDialog();
      expect(await screen.findByText(/error al generar el código/i)).toBeInTheDocument();
      expect(pairAgent).not.toHaveBeenCalled();
    });
  });
});
