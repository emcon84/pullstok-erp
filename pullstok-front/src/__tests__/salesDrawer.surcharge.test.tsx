import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CartItem } from "@/models/salesModel";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// NativeSelect wraps the shadcn Select (needs matchMedia in jsdom): a plain
// <select> keeps the selected method deterministic.
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    id,
    value,
    onValueChange,
    options,
  }: {
    id?: string;
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select id={id} value={value} onChange={(e) => onValueChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/molecules/ProductSelector", () => ({
  ProductSelector: () => null,
}));

import { SalesDrawer } from "@/components/molecules/SalesDrawer";

const PCT_LABEL = "Recargo tarjeta (%)";

const cart: CartItem[] = [
  {
    product: { _id: "p1", id: "p1", name: "Royal Canin 15kg", price: 1000 } as CartItem["product"],
    quantity: 1,
    totalPrice: 1000,
    saleMode: "BOLSA_CERRADA",
  },
];

function drawer(onConfirm = vi.fn(), isOpen = true) {
  return (
    <SalesDrawer
      isOpen={isOpen}
      onClose={vi.fn()}
      products={[]}
      title="Nueva venta"
      editing
      initialCart={cart}
      cashSessionId="cs-1"
      onConfirm={onConfirm}
    />
  );
}

/** Adds a payment row with `method` for `amount` (the "Monto" field splits payments). */
function addPayment(method: string, amount: string) {
  fireEvent.change(screen.getByLabelText("Método"), { target: { value: method } });
  fireEvent.change(screen.getByLabelText("Monto"), { target: { value: amount } });
  fireEvent.click(screen.getByText(/Agregar pago/));
}

const pctInput = () => screen.getByLabelText(PCT_LABEL) as HTMLInputElement;

describe("SalesDrawer — credit card surcharge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the surcharge field without a TARJETA_CREDITO row", () => {
    render(drawer());
    expect(screen.queryByLabelText(PCT_LABEL)).not.toBeInTheDocument();

    addPayment("EFECTIVO", "1000");
    expect(screen.queryByLabelText(PCT_LABEL)).not.toBeInTheDocument();
  });

  it("shows the surcharge field once a TARJETA_CREDITO row exists", () => {
    render(drawer());
    addPayment("TARJETA_CREDITO", "1000");
    expect(screen.getByLabelText(PCT_LABEL)).toBeInTheDocument();
  });

  it("charges the surcharge on the card row only (mixed cash + card)", () => {
    render(drawer());
    addPayment("EFECTIVO", "600");
    addPayment("TARJETA_CREDITO", "400");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    // 10% of the card portion (400) = 40, not of the whole 1000.
    expect(screen.getByText("Recargo tarjeta")).toBeInTheDocument();
    expect(screen.getByText("+$40,00")).toBeInTheDocument();
    expect(screen.getByText("total a cobrar")).toBeInTheDocument();
    expect(screen.getByText("$1.040,00")).toBeInTheDocument();
  });

  it("applies the surcharge over the already discounted amount", () => {
    render(drawer());
    fireEvent.change(screen.getByLabelText("Descuento (%)"), { target: { value: "10" } });
    addPayment("TARJETA_CREDITO", "900");
    fireEvent.change(pctInput(), { target: { value: "5" } });

    // total 900 (10% off) + 5% of 900 = 945
    expect(screen.getByText("+$45,00")).toBeInTheDocument();
    expect(screen.getByText("$945,00")).toBeInTheDocument();
  });

  it("confirms with the BASE payments and the surcharge pct", () => {
    const onConfirm = vi.fn();
    render(drawer(onConfirm));
    addPayment("EFECTIVO", "600");
    addPayment("TARJETA_CREDITO", "400");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    fireEvent.click(screen.getByText("Confirmar"));

    expect(onConfirm).toHaveBeenCalledWith(
      cart,
      "",
      "",
      "",
      [
        { method: "EFECTIVO", amount: 600 },
        { method: "TARJETA_CREDITO", amount: 400 },
      ],
      "cs-1",
      0,
      10,
    );
  });

  it("sends surchargePct 0 once the card row is gone", () => {
    const onConfirm = vi.fn();
    render(drawer(onConfirm));
    addPayment("TARJETA_CREDITO", "1000");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    fireEvent.click(screen.getByText("Limpiar"));

    expect(screen.queryByLabelText(PCT_LABEL)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirmar"));
    expect(onConfirm).toHaveBeenCalledWith(
      cart,
      "",
      "",
      "",
      [{ method: "EFECTIVO", amount: 1000 }],
      "cs-1",
      0,
      0,
    );
  });

  it("does not resurrect a stale pct when a card row is added again", () => {
    render(drawer());
    addPayment("TARJETA_CREDITO", "1000");
    fireEvent.change(pctInput(), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Limpiar"));

    addPayment("TARJETA_CREDITO", "1000");
    expect(pctInput().value).toBe("");
  });

  it("resets the pct after confirming", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(drawer(onConfirm));
    addPayment("TARJETA_CREDITO", "1000");
    fireEvent.change(pctInput(), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Confirmar"));

    // Reopen (the editing effect reloads the cart) and pay by card again.
    rerender(drawer(onConfirm, false));
    rerender(drawer(onConfirm, true));
    addPayment("TARJETA_CREDITO", "1000");
    expect(pctInput().value).toBe("");
  });

  it("clamps the pct to 100", () => {
    render(drawer());
    addPayment("TARJETA_CREDITO", "1000");
    fireEvent.change(pctInput(), { target: { value: "250" } });
    expect(pctInput().value).toBe("100");
  });
});
