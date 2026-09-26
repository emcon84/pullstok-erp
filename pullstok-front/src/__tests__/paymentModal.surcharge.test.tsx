import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// NativeSelect wraps the shadcn Select (needs matchMedia in jsdom): a plain
// <select> keeps the selected method deterministic.
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    value,
    onValueChange,
    options,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

import { PaymentModal } from "@/components/molecules/PaymentModal";

const PCT_LABEL = "Recargo tarjeta (%)";

function modal(over: Partial<React.ComponentProps<typeof PaymentModal>> = {}) {
  return (
    <PaymentModal
      open
      onOpenChange={vi.fn()}
      total={1000}
      cashSessionId="cs-1"
      discountPct={0}
      confirmSale={vi.fn()}
      {...over}
    />
  );
}

/** Adds a second row (the modal picks TARJETA_CREDITO next) and types its amount. */
function addCardRow(amount: string) {
  fireEvent.click(screen.getByText("Agregar forma de pago"));
  const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
  fireEvent.change(boxes[1], { target: { value: amount } });
}

const pctInput = () => screen.getByLabelText(PCT_LABEL) as HTMLInputElement;

describe("PaymentModal — credit card surcharge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the surcharge field when no row is TARJETA_CREDITO", () => {
    render(modal());
    expect(screen.queryByLabelText(PCT_LABEL)).not.toBeInTheDocument();
  });

  it("shows the surcharge field once a row is TARJETA_CREDITO", () => {
    render(modal());
    addCardRow("400");
    expect(screen.getByLabelText(PCT_LABEL)).toBeInTheDocument();
  });

  it("charges the surcharge on the card row only (mixed cash + card)", () => {
    render(modal());
    addCardRow("400");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    // 10% of the card portion (400) = 40, not of the whole 1000.
    expect(screen.getByText("Recargo tarjeta")).toBeInTheDocument();
    expect(screen.getByText("$40,00")).toBeInTheDocument();
    expect(screen.getByText("$1.040,00")).toBeInTheDocument();
  });

  it("confirms with the BASE payments and the surcharge pct", () => {
    const confirmSale = vi.fn();
    render(modal({ confirmSale, discountPct: 5 }));
    addCardRow("400");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    fireEvent.click(screen.getByText("VENDER"));

    expect(confirmSale).toHaveBeenCalledWith(
      [
        { method: "EFECTIVO", amount: 600 },
        { method: "TARJETA_CREDITO", amount: 400 },
      ],
      "cs-1",
      5,
      10,
    );
  });

  it("sends surchargePct 0 when no card row was left", () => {
    const confirmSale = vi.fn();
    render(modal({ confirmSale }));
    addCardRow("400");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    fireEvent.click(screen.getByLabelText("Quitar forma de pago 2"));

    expect(screen.queryByLabelText(PCT_LABEL)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("VENDER"));
    expect(confirmSale).toHaveBeenCalledWith(
      [{ method: "EFECTIVO", amount: 1000 }],
      "cs-1",
      0,
      0,
    );
  });

  it("does not resurrect a stale pct when a card row is added again", () => {
    render(modal());
    addCardRow("400");
    fireEvent.change(pctInput(), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("Quitar forma de pago 2"));

    addCardRow("300");
    expect(pctInput().value).toBe("");
  });

  it("resets the pct whenever the modal is reopened", () => {
    const { rerender } = render(modal());
    addCardRow("400");
    fireEvent.change(pctInput(), { target: { value: "10" } });

    rerender(modal({ open: false }));
    rerender(modal({ open: true }));

    addCardRow("400");
    expect(pctInput().value).toBe("");
  });

  it("keeps the input digits-only and clamps to 100", () => {
    render(modal());
    addCardRow("400");

    fireEvent.change(pctInput(), { target: { value: "abc" } });
    expect(pctInput().value).toBe("");
    fireEvent.change(pctInput(), { target: { value: "250" } });
    expect(pctInput().value).toBe("100");
  });

  it("does not hijack digits typed inside the pct input (1..N row jump)", () => {
    render(modal());
    addCardRow("400");
    pctInput().focus();

    // fireEvent returns false when the event was cancelled (preventDefault).
    expect(fireEvent.keyDown(pctInput(), { key: "2" })).toBe(true);
    expect(document.activeElement).toBe(pctInput());
  });
});
