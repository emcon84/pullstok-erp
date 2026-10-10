import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const searchProduct = vi.fn();
const openBag = vi.fn();
const base = { brandKeywords: [], typeSynonyms: [], priceKg: 5000 };
const cells = [
  { ...base, id: "ex-ad-dog", brandName: "Excellent", typeName: "Adulto", typeSynonyms: ["adult"], species: "PERRO", label: "Excellent · Adulto · Perro — $5.000/kg" },
  { ...base, id: "ex-cach-dog", brandName: "Excellent", typeName: "Cachorro", typeSynonyms: ["puppy"], species: "PERRO", label: "Excellent · Cachorro · Perro — $5.000/kg" },
  { ...base, id: "pp-ad-dog", brandName: "Pro Plan", typeName: "Adulto", species: "PERRO", priceKg: 6000, label: "Pro Plan · Adulto · Perro — $6.000/kg" },
  { ...base, id: "dc-ad", brandName: "DOG CHOW", typeName: "Adulto", typeSynonyms: ["adult"], species: "PERRO", priceKg: 3600, label: "DOG CHOW · Adulto · Perro — $3.600/kg" },
  { ...base, id: "dcrp-ad", brandName: "DOG CHOW RP", typeName: "Adulto", typeSynonyms: ["adult"], species: "PERRO", priceKg: 3800, label: "DOG CHOW RP · Adulto · Perro — $3.800/kg" },
  { ...base, id: "dcrp-cach", brandName: "DOG CHOW RP", typeName: "Cachorro", typeSynonyms: ["puppy"], species: "PERRO", priceKg: 4100, label: "DOG CHOW RP · Cachorro · Perro — $4.100/kg" },
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

import { toast } from "react-toastify";
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

  it("shows the matching brand cells as pills and opens the clicked one with a single click", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<OpenBagDialog branchId="b" open onOpenChange={onOpenChange} onSuccess={onSuccess} initialBarcode="B1" />);

    const pill = await screen.findByRole("radio", { name: /Adulto · Perro — \$5\.000\/kg/ });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /Pro Plan/ })).toBeNull();
    // never auto-selected
    expect(pill).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /abrir bolsa/i })).toBeDisabled();

    fireEvent.click(pill);
    await waitFor(() => expect(openBag).toHaveBeenCalledWith("p1", "ex-ad-dog"));
    expect(openBag).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click on a pill while the bag is being opened", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    let resolve!: (v: unknown) => void;
    openBag.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);

    const pill = await screen.findByRole("radio", { name: /Adulto · Perro/ });
    fireEvent.click(pill);
    fireEvent.click(pill);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(openBag).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pill).toBeDisabled());
    resolve({ priceKgPriceId: "ex-ad-dog" });
  });

  it("keeps the dialog open when opening from a pill fails", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    openBag.mockRejectedValue(new Error("boom"));
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<OpenBagDialog branchId="b" open onOpenChange={onOpenChange} onSuccess={onSuccess} initialBarcode="B1" />);

    fireEvent.click(await screen.findByRole("radio", { name: /Adulto · Perro/ }));
    await waitFor(() => expect(openBag).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByRole("radio")[0]).toBeEnabled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("still needs the Abrir bolsa button when the cell is picked in the select", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);
    await screen.findAllByRole("radio");

    fireEvent.click(screen.getByLabelText("Celda destino para abrir bolsa"));
    fireEvent.click(await screen.findByText("Pro Plan · Adulto · Perro — $6.000/kg"));
    expect(openBag).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /abrir bolsa/i }));
    await waitFor(() => expect(openBag).toHaveBeenCalledWith("p1", "pp-ad-dog"));
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

  it("suggests the razas brand cell and opens it with one click", async () => {
    searchProduct.mockResolvedValue(scan("DOG CHOW ADULT RAZAS PEQUEÑAS X20KG"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);

    const pills = await screen.findAllByRole("radio");
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveTextContent("DOG CHOW RP · Adulto · Perro — $3.800/kg");
    expect(screen.getByText("Sugeridas para DOG CHOW RP")).toBeInTheDocument();

    fireEvent.click(pills[0]);
    await waitFor(() => expect(openBag).toHaveBeenCalledWith("p1", "dcrp-ad"));
    expect(openBag).toHaveBeenCalledTimes(1);
  });
});

describe("OpenBagDialog — number key shortcuts", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const press = (key: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(window, { key, code: /^\d$/.test(key) ? `Digit${key}` : key, ...init });
  // Product result shown + the post-render quiet period elapsed.
  const showPills = async (name = "Excellent Perro 15kg") => {
    searchProduct.mockResolvedValue(scan(name));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);
    const pills = await screen.findAllByRole("radio");
    await act(async () => {
      await sleep(160);
    });
    return pills;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    openBag.mockResolvedValue({ priceKgPriceId: "ex-ad-dog" });
  });

  it("numbers the pills with a badge and shows the hint", async () => {
    const pills = await showPills();
    expect(pills[0]).toHaveTextContent(/^1/);
    expect(pills[1]).toHaveTextContent(/^2/);
    expect(screen.getByText("Tocá o presioná el número")).toBeInTheDocument();
  });

  it("opens the second pill's cell when 2 is pressed once", async () => {
    await showPills();
    press("2");
    await waitFor(() => expect(openBag).toHaveBeenCalledWith("p1", "ex-cach-dog"));
    await act(async () => {
      await sleep(200);
    });
    expect(openBag).toHaveBeenCalledTimes(1);
  });

  it("works with the numpad and with a single pill via 1", async () => {
    await showPills("Excellent Cachorro Puppy 15kg");
    press("1", { code: "Numpad1" });
    await waitFor(() => expect(openBag).toHaveBeenCalledWith("p1", "ex-cach-dog"));
  });

  it("does not fire when another key arrives inside the burst window", async () => {
    await showPills();
    press("2");
    press("5");
    await act(async () => {
      await sleep(300);
    });
    expect(openBag).not.toHaveBeenCalled();
  });

  it("does not fire when Enter follows the digit (scanner burst)", async () => {
    await showPills();
    press("2");
    press("Enter");
    await act(async () => {
      await sleep(300);
    });
    expect(openBag).not.toHaveBeenCalled();
  });

  it("ignores digits typed into the barcode input before a result is shown", async () => {
    searchProduct.mockResolvedValue(scan("Excellent Perro 15kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.keyDown(input, { key: "2", code: "Digit2" });
    await act(async () => {
      await sleep(250);
    });
    expect(openBag).not.toHaveBeenCalled();
  });

  it("moves focus off the barcode input once a product is found", async () => {
    await showPills();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).not.toHaveFocus();
  });

  it("ignores a digit while an editable field has focus", async () => {
    await showPills();
    screen.getByPlaceholderText(PLACEHOLDER).focus();
    press("2");
    await act(async () => {
      await sleep(250);
    });
    expect(openBag).not.toHaveBeenCalled();
  });

  it("ignores numbers beyond the pill count, modifiers and key repeat", async () => {
    await showPills();
    press("3");
    await act(async () => {
      await sleep(250);
    });
    press("1", { ctrlKey: true });
    await act(async () => {
      await sleep(250);
    });
    press("1", { repeat: true });
    await act(async () => {
      await sleep(250);
    });
    expect(openBag).not.toHaveBeenCalled();
  });

  it("does nothing when there are no pills", async () => {
    searchProduct.mockResolvedValue(scan("Whiskas Atun 1kg"));
    render(<OpenBagDialog branchId="b" open onOpenChange={() => {}} initialBarcode="B1" />);
    await screen.findByText("Whiskas Atun 1kg");
    await act(async () => {
      await sleep(160);
    });
    press("1");
    await act(async () => {
      await sleep(250);
    });
    expect(openBag).not.toHaveBeenCalled();
    expect(screen.queryByText("Tocá o presioná el número")).toBeNull();
  });

  it("is disabled while a bag is being opened", async () => {
    await showPills();
    let resolve!: (v: unknown) => void;
    openBag.mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.click(screen.getAllByRole("radio")[0]);
    await waitFor(() => expect(screen.getAllByRole("radio")[0]).toBeDisabled());
    await act(async () => {
      await sleep(160);
    });
    press("2");
    await act(async () => {
      await sleep(250);
    });
    expect(openBag).toHaveBeenCalledTimes(1);
    resolve({ priceKgPriceId: "ex-ad-dog" });
  });
});
