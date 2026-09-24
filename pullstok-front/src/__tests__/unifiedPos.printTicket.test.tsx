import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Flujo completo POS → checkout REAL → diálogo "¿Imprimir ticket?".
// Se mockean el carrito, la API de ventas y el panel (que expone un botón que
// confirma la venta con pagos + descuento como haría PaymentModal).
vi.mock("@/components/organisms/VendorCatalogTab", () => ({
  VendorCatalogTab: () => <div data-testid="catalog-tab" />,
}));
vi.mock("@/components/organisms/LooseSellTab", () => ({
  LooseSellTab: () => <div data-testid="loose-tab" />,
}));
vi.mock("@/components/hooks/useVendorCart", () => ({ useVendorCart: vi.fn() }));
vi.mock("@/components/hooks/useCashSession", () => ({ useGetCurrentCashSession: vi.fn() }));
vi.mock("@/components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("@/components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));
vi.mock("@/components/hooks/useBranches", () => ({ useBranches: vi.fn() }));
vi.mock("@/services/onboardingService", () => ({ getMe: vi.fn() }));
vi.mock("@/contexts/BrandingContext", () => ({ useBrandingContext: vi.fn() }));
vi.mock("@/utils/saleTicket", async () => {
  const actual = await vi.importActual<typeof import("@/utils/saleTicket")>("@/utils/saleTicket");
  return { ...actual, printSaleTicket: vi.fn() };
});
vi.mock("@/components/molecules/VendorOrderPanel", () => ({
  VendorOrderPanel: ({
    confirmSale,
  }: {
    confirmSale: (p?: unknown[], cs?: string, d?: number) => void;
  }) => (
    <button
      data-testid="sell"
      onClick={() => confirmSale([{ method: "EFECTIVO", amount: 14400 }], "cs-1", 10)}
    >
      vender
    </button>
  ),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { UnifiedPos } from "@/views/UnifiedPos";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { useCreateSale } from "@/components/hooks/useSales";
import { useCreateOrder } from "@/components/hooks/useOrder";
import { useBranches } from "@/components/hooks/useBranches";
import { getMe } from "@/services/onboardingService";
import { useBrandingContext } from "@/contexts/BrandingContext";
import { printSaleTicket } from "@/utils/saleTicket";

const items = [
  {
    productId: "p1",
    name: "Royal Canin 15kg",
    code: "R15",
    price: 8000,
    stock: 10,
    quantity: 2,
    branchId: "branch-1",
    saleMode: "BOLSA_CERRADA",
  },
];

const me = (role = "VENDEDOR") => ({
  id: "u1",
  role,
  organization: {
    id: "o1",
    name: "Razón Social SA",
    taxId: "30-12345678-9",
    taxCondition: "IVA Responsable Inscripto",
    address: "Dirección org",
    phone: "111-org",
  },
});

function renderPos(role = "VENDEDOR") {
  vi.mocked(getMe).mockResolvedValue(me(role) as never);
  const clearCart = vi.fn();
  vi.mocked(useVendorCart).mockReturnValue({
    items,
    totalAmount: 16000,
    itemCount: 2,
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart,
  } as never);
  vi.mocked(useGetCurrentCashSession).mockReturnValue({
    session: { id: "cs-1", status: "OPEN" },
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useCreateOrder).mockReturnValue({ submitOrder: vi.fn(), loading: false } as never);
  vi.mocked(useBrandingContext).mockReturnValue({
    branding: { displayName: "Mi Pet Shop", logoUrl: "https://cdn.test/logo.png" },
    isLoading: false,
  } as never);
  // Como el hook real: con la query deshabilitada no hay sucursales.
  vi.mocked(useBranches).mockImplementation(
    (enabled = true) =>
      ({
        branches: enabled
          ? [{ id: "branch-1", name: "Centro", address: "Dirección sucursal", phone: "222-suc" }]
          : [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      }) as never,
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { clearCart };
}

async function sell() {
  // Deja que resuelva la query ["me"] (en producción ya está en cache).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    fireEvent.click(await screen.findByTestId("sell"));
  });
}

/** La impresión se difiere hasta que el diálogo ya se cerró. */
const printed = (times = 1) => waitFor(() => expect(printSaleTicket).toHaveBeenCalledTimes(times));

describe("UnifiedPos — ¿Imprimir ticket? tras la venta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateSale).mockReturnValue({
      createSale: vi.fn().mockResolvedValue({}),
    } as never);
  });

  it("no muestra el diálogo antes de vender", async () => {
    renderPos();
    await screen.findByTestId("sell");
    expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument();
  });

  it("venta OK: aparece el diálogo", async () => {
    renderPos();
    await sell();
    expect(await screen.findByText("¿Imprimir ticket?")).toBeInTheDocument();
  });

  it("'No': cierra el diálogo y NO imprime", async () => {
    renderPos();
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: "No" }));

    await waitFor(() =>
      expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument(),
    );
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("'Sí': imprime UNA vez con el ticket de la venta y cierra el diálogo", async () => {
    renderPos();
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: /sí, imprimir/i }));

    await printed();
    const ticket = vi.mocked(printSaleTicket).mock.calls[0][0];
    // 16000 con 10% de descuento → 14400
    expect(ticket.total).toBe(14400);
    expect(ticket.discountAmount).toBe(1600);
    expect(ticket.lines[0].label).toBe("Royal Canin 15kg");
    expect(ticket.payments).toEqual([{ methodLabel: "Efectivo", amount: 14400 }]);
    await waitFor(() =>
      expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument(),
    );
  });

  it("atajo de teclado S imprime desde el diálogo", async () => {
    renderPos();
    await sell();
    const yes = await screen.findByRole("button", { name: /sí, imprimir/i });
    fireEvent.keyDown(yes, { key: "s" });
    await printed();
  });

  it("venta fallida: el diálogo NUNCA aparece", async () => {
    vi.mocked(useCreateSale).mockReturnValue({
      createSale: vi.fn().mockRejectedValue(new Error("sin stock")),
    } as never);
    const { clearCart } = renderPos();
    await sell();

    await waitFor(() => expect(clearCart).not.toHaveBeenCalled());
    expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument();
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("encabezado: logo, nombre, CUIT y condición de la organización", async () => {
    renderPos();
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: /sí, imprimir/i }));
    await printed();
    const ticket = vi.mocked(printSaleTicket).mock.calls[0][0];
    expect(ticket.businessName).toBe("Mi Pet Shop");
    expect(ticket.logoUrl).toBe("https://cdn.test/logo.png");
    expect(ticket.taxId).toBe("30-12345678-9");
    expect(ticket.taxCondition).toBe("IVA Responsable Inscripto");
  });

  it("VENDEDOR: dirección y teléfono de la organización (no puede listar sucursales)", async () => {
    renderPos("VENDEDOR");
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: /sí, imprimir/i }));
    await printed();
    const ticket = vi.mocked(printSaleTicket).mock.calls[0][0];
    expect(ticket.address).toBe("Dirección org");
    expect(ticket.phone).toBe("111-org");
    // Para un VENDEDOR la query de sucursales queda deshabilitada (403).
    expect(vi.mocked(useBranches).mock.calls.every(([enabled]) => enabled === false)).toBe(true);
  });

  it("ADMIN: la dirección y el teléfono de la sucursal ganan", async () => {
    renderPos("ADMIN");
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: /sí, imprimir/i }));
    await printed();
    const ticket = vi.mocked(printSaleTicket).mock.calls[0][0];
    expect(ticket.address).toBe("Dirección sucursal");
    expect(ticket.phone).toBe("222-suc");
  });

  it("'Sí': el diálogo ya está cerrado CUANDO se invoca la impresión (no antes)", async () => {
    let dialogOpenAtPrint: boolean | null = null;
    vi.mocked(printSaleTicket).mockImplementation(async () => {
      dialogOpenAtPrint = !!screen.queryByText("¿Imprimir ticket?");
    });
    renderPos();
    await sell();
    const yes = await screen.findByRole("button", { name: /sí, imprimir/i });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(yes);
      // Todavía no se imprimió: primero tiene que terminar de irse el diálogo.
      expect(printSaleTicket).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(printSaleTicket).toHaveBeenCalledTimes(1);
    expect(dialogOpenAtPrint).toBe(false);
    expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument();
  });

  it("'Sí' con impresión que falla: el diálogo se cierra igual y no revienta", async () => {
    vi.mocked(printSaleTicket).mockImplementation(() => {
      throw new Error("sin impresora");
    });
    renderPos();
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: /sí, imprimir/i }));

    await waitFor(() =>
      expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument(),
    );
    await printed();
    // Damos un tick extra: un error no atrapado en el timer rompería el test.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it("'Sí' con impresión asíncrona que rechaza: no genera rechazo sin manejar", async () => {
    vi.mocked(printSaleTicket).mockRejectedValue(new Error("boom") as never);
    renderPos();
    await sell();
    fireEvent.click(await screen.findByRole("button", { name: /sí, imprimir/i }));
    await printed();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });
});
