import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const searchProduct = vi.fn();
const openBag = vi.fn();
const base = { brandKeywords: [], typeSynonyms: [], priceKg: 5000 };
const cells = [
  { ...base, id: "ex-ad-dog", brandName: "Excellent", typeName: "Adulto", typeSynonyms: ["adult"], species: "PERRO", label: "Excellent · Adulto · Perro — $5.000/kg" },
  { ...base, id: "ex-cach-dog", brandName: "Excellent", typeName: "Cachorro", typeSynonyms: ["puppy"], species: "PERRO", label: "Excellent · Cachorro · Perro — $5.000/kg" },
  { ...base, id: "pp-ad-dog", brandName: "Pro Plan", typeName: "Adulto", species: "PERRO", priceKg: 6000, label: "Pro Plan · Adulto · Perro — $6.000/kg" },
];
vi.mock("@/components/hooks/useOpenBag", () => ({
  useOpenBag: () => ({
    cellOptions: cells.map((c) => ({ value: c.id, label: c.label })),
    cells,
    loadingCells: false,
    searchProduct,
    openBag,
    error: null,
    loading: false,
    clearError: () => {},
  }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OpenBagDialog } from "@/components/molecules/OpenBagDialog";

const scan = (name: string) => ({
  product: { id: "p1", name, weightKg: 15, price: 18400, code: "C1", barcode: "B1", category: null },
});
const PLACEHOLDER = "Escaneá o ingresá el código de barras";

describe("OpenBagDialog — smart cell pills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openBag.mockResolvedValue({ priceKgPriceId: "ex-ad-dog" });
  });

  it("shows the matching brand cells as pills and opens the clicked one", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);

    const pill = await screen.findByRole("radio", { name: /Adulto · Perro — \$5\.000\/kg/ });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /Pro Plan/ })).toBeNull();
    // never auto-selected
    expect(pill).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /abrir bolsa/i })).toBeDisabled();

    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-checked", "true");
    const confirm = screen.getByRole("button", { name: /abrir bolsa/i });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(openBag).toHaveBeenCalledWith("p1", "ex-ad-dog"));
  });

  it("highlights the single narrowed pill without selecting it", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Cachorro Puppy 15kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);

    const pills = await screen.findAllByRole("radio");
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveAttribute("data-prominent", "true");
    expect(pills[0]).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the select as a fallback when pills are shown", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);
    await screen.findAllByRole("radio");
    expect(screen.getByLabelText("Celda destino para abrir bolsa")).toBeInTheDocument();
  });

  it("shows only the select when no brand matches", async () => {
    searchProduct.mockResolvedValue(scan("Whiskas Atun 1kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);
    await screen.findByText("Whiskas Atun 1kg");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByLabelText("Celda destino para abrir bolsa")).toBeInTheDocument();
  });

  it("also suggests pills after a manual scan", async () => {
    searchProduct.mockResolvedValue(scan("Pro Plan Adulto 15kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "B1" } });
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    expect(await screen.findByRole("radio", { name: /Adulto · Perro — \$6\.000\/kg/ })).toBeInTheDocument();
  });
});
