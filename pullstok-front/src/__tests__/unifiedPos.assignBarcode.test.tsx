import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/organisms/VendorCatalogTab", () => ({
  VendorCatalogTab: () => <div data-testid="catalog-tab" />,
}));
vi.mock("@/components/organisms/LooseSellTab", () => ({
  LooseSellTab: () => <div data-testid="loose-tab" />,
}));
vi.mock("@/components/hooks/useVendorCart", () => ({ useVendorCart: vi.fn() }));
vi.mock("@/components/hooks/useVendorCheckout", () => ({ useVendorCheckout: vi.fn() }));
vi.mock("@/components/hooks/useCashSession", () => ({ useGetCurrentCashSession: vi.fn() }));
vi.mock("@/components/molecules/VendorOrderPanel", () => ({
  VendorOrderPanel: () => <div data-testid="order-panel" />,
}));
vi.mock("@/services/onboardingService", () => ({
  getMe: vi.fn().mockResolvedValue({ sellsWholesale: false }),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: toastMock }));

import { UnifiedPos } from "@/views/UnifiedPos";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";

// POS mounts unrelated fetches (price-kg-*); route by URL so queued replies
// only go to the calls under test (by-scan / products search / PUT).
const fetchMock = vi.fn();
const queue: Array<{ body: unknown; status: number }> = [];
const reply = (body: unknown, status = 200) => queue.push({ body, status });
const routedFetch = (url: string) => {
  const relevant = /by-scan|\/products(\?|\/)/.test(String(url));
  const next = relevant ? queue.shift() : undefined;
  const { body, status } = next ?? { body: [], status: 200 };
  return Promise.resolve({ status, ok: status < 400, json: async () => body });
};
const relevantCalls = () =>
  fetchMock.mock.calls.filter((c) => /by-scan|\/products(\?|\/)/.test(String(c[0])));

function renderPos() {
  vi.mocked(useVendorCart).mockReturnValue({
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
  } as never);
  vi.mocked(useVendorCheckout).mockReturnValue({} as never);
  vi.mocked(useGetCurrentCashSession).mockReturnValue({
    session: { id: "cs-1", status: "OPEN" },
    loading: false,
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function scanCode(code: string) {
  for (const ch of code) fireEvent.keyDown(window, { key: ch });
  fireEvent.keyDown(window, { key: "Enter" });
}

describe("UnifiedPos — vincular código en 404", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    fetchMock.mockImplementation(routedFetch);
    queue.length = 0;
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("token", "tok");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("404 abre Vincular código con el código y sin toast de error", async () => {
    reply({}, 404);
    renderPos();
    scanCode("0000000000000");
    expect(await screen.findByText("Vincular código")).toBeInTheDocument();
    expect(screen.getByText("0000000000000")).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("mientras el diálogo está abierto no se captura otro escaneo", async () => {
    reply({}, 404);
    renderPos();
    scanCode("0000000000000");
    await screen.findByText("Vincular código");
    scanCode("1111111111");
    expect(relevantCalls()).toHaveLength(1);
  });

  it("al asignar re-escanea el código y abre el modal de confirmación del producto", async () => {
    reply({}, 404);
    reply([{ id: "p1", name: "Royal 15kg", code: "R15" }]);
    reply({ id: "p1", name: "Royal 15kg", barcode: "0000000000000" });
    reply({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, quantity: 10 },
    });
    renderPos();
    scanCode("0000000000000");
    await screen.findByText("Vincular código");
    fireEvent.change(screen.getByPlaceholderText(/Buscá el producto por nombre/), {
      target: { value: "royal" },
    });
    fireEvent.click(await screen.findByText("Royal 15kg"));
    expect(await screen.findByRole("button", { name: "Agregar al pedido" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Vincular código")).not.toBeInTheDocument());
    expect(String(relevantCalls()[3][0])).toContain("/products/by-scan/0000000000000");
  });
});
