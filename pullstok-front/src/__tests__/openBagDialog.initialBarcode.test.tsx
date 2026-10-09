import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const searchProduct = vi.fn();
vi.mock("@/components/hooks/useOpenBag", () => ({
  useOpenBag: () => ({
    cellOptions: [],
    loadingCells: false,
    searchProduct,
    openBag: vi.fn(),
    error: null,
    loading: false,
    clearError: () => {},
  }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OpenBagDialog } from "@/components/molecules/OpenBagDialog";

const result = {
  product: { id: "p1", name: "Royal 15kg", weightKg: 15, price: 18400, code: "C1", barcode: "B1", category: null },
};
const PLACEHOLDER = "Escaneá o ingresá el código de barras";

describe("OpenBagDialog — initialBarcode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchProduct.mockResolvedValue(result);
  });

  it("con initialBarcode busca automáticamente al abrir y muestra el producto", async () => {
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);

    await waitFor(() => expect(searchProduct).toHaveBeenCalledWith("B1"));
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue("B1");
    expect(await screen.findByText("Royal 15kg")).toBeInTheDocument();
  });

  it("sin initialBarcode no busca solo y el submit manual sigue funcionando", async () => {
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} />);

    expect(searchProduct).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue("");

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: " X9 " } });
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    await waitFor(() => expect(searchProduct).toHaveBeenCalledWith("X9"));
    expect(await screen.findByText("Royal 15kg")).toBeInTheDocument();
  });
});
