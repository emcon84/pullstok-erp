import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { toast } from "react-toastify";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// NativeSelect wraps the shadcn Select (needs matchMedia in jsdom): a plain
// <select> keeps the selected value deterministic. The placeholder is rendered
// as the empty option, like the native (touch) variant does.
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    value,
    onValueChange,
    options,
    placeholder,
    ariaLabel,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    ariaLabel?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/hooks/useCustomer", () => ({
  useCustomers: vi.fn(),
}));

import { PaymentModal } from "@/components/molecules/PaymentModal";
import { useCustomers } from "@/components/hooks/useCustomer";

const CUSTOMER_LABEL = "Cliente (cuenta corriente)";

const customers = [
  { id: "c-2", name: "Zulema Pérez", email: "", phone: "" },
  { id: "c-1", name: "Ana Gómez", email: "", phone: "" },
];

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

/** Adds a second row and switches its method to CUENTA_CORRIENTE, then types the amount. */
function addAccountRow(amount: string) {
  fireEvent.click(screen.getByText("Agregar forma de pago"));
  const selects = screen.getAllByRole("combobox").filter(
    (el) => el.getAttribute("aria-label") !== CUSTOMER_LABEL,
  );
  fireEvent.change(selects[1], { target: { value: "CUENTA_CORRIENTE" } });
  const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
  fireEvent.change(boxes[1], { target: { value: amount } });
}

const customerSelect = () => screen.getByLabelText(CUSTOMER_LABEL) as HTMLSelectElement;

describe("PaymentModal — cuenta corriente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCustomers).mockReturnValue({
      customers,
      loadingCustomer: false,
      errorCustomer: null,
    } as never);
  });

  it("offers Cuenta corriente as a payment method in the row select", () => {
    render(modal());
    expect(screen.getByRole("option", { name: "Cuenta corriente" })).toBeInTheDocument();
  });

  it("shows the customer selector only while a CUENTA_CORRIENTE row exists", () => {
    render(modal());
    expect(screen.queryByLabelText(CUSTOMER_LABEL)).not.toBeInTheDocument();

    addAccountRow("400");
    expect(customerSelect()).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Quitar forma de pago 2"));
    expect(screen.queryByLabelText(CUSTOMER_LABEL)).not.toBeInTheDocument();
  });

  it("lists customers sorted by name with the placeholder selected", () => {
    render(modal());
    addAccountRow("400");

    const labels = Array.from(customerSelect().options).map((o) => o.textContent);
    expect(labels).toEqual(["Seleccioná un cliente", "Ana Gómez", "Zulema Pérez"]);
    expect(customerSelect().value).toBe("");
  });

  it("blocks the sale without a customer and does not call confirmSale", () => {
    const confirmSale = vi.fn();
    const onOpenChange = vi.fn();
    render(modal({ confirmSale, onOpenChange }));
    addAccountRow("400");

    fireEvent.click(screen.getByText("VENDER"));

    expect(toast.error).toHaveBeenCalledWith(
      "Seleccioná un cliente para la venta en cuenta corriente",
    );
    expect(confirmSale).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("confirms with the customerId as the 5th argument", () => {
    const confirmSale = vi.fn();
    render(modal({ confirmSale, discountPct: 5 }));
    addAccountRow("400");
    fireEvent.change(customerSelect(), { target: { value: "c-1" } });

    fireEvent.click(screen.getByText("VENDER"));

    expect(confirmSale).toHaveBeenCalledWith(
      [
        { method: "EFECTIVO", amount: 600 },
        { method: "CUENTA_CORRIENTE", amount: 400 },
      ],
      "cs-1",
      5,
      0,
      "c-1",
    );
  });

  it("never sends a customerId for a sale without an account row", () => {
    const confirmSale = vi.fn();
    render(modal({ confirmSale }));
    addAccountRow("400");
    fireEvent.change(customerSelect(), { target: { value: "c-1" } });
    fireEvent.click(screen.getByLabelText("Quitar forma de pago 2"));

    fireEvent.click(screen.getByText("VENDER"));

    expect(confirmSale).toHaveBeenCalledWith(
      [{ method: "EFECTIVO", amount: 1000 }],
      "cs-1",
      0,
      0,
    );
  });

  it("does not require a customer when the account row has no amount", () => {
    const confirmSale = vi.fn();
    render(modal({ confirmSale }));
    addAccountRow("0");

    fireEvent.click(screen.getByText("VENDER"));

    expect(toast.error).not.toHaveBeenCalled();
    expect(confirmSale).toHaveBeenCalledWith(
      [{ method: "EFECTIVO", amount: 1000 }],
      "cs-1",
      0,
      0,
    );
  });

  it("forgets the customer once the account row is removed", () => {
    render(modal());
    addAccountRow("400");
    fireEvent.change(customerSelect(), { target: { value: "c-1" } });
    fireEvent.click(screen.getByLabelText("Quitar forma de pago 2"));

    addAccountRow("300");
    expect(customerSelect().value).toBe("");
  });

  it("forgets the customer whenever the modal is reopened", () => {
    const { rerender } = render(modal());
    addAccountRow("400");
    fireEvent.change(customerSelect(), { target: { value: "c-1" } });

    rerender(modal({ open: false }));
    rerender(modal({ open: true }));

    addAccountRow("400");
    expect(customerSelect().value).toBe("");
  });

  it("keeps the card surcharge on the card row only when mixed with an account row", () => {
    const confirmSale = vi.fn();
    render(modal({ confirmSale }));
    addAccountRow("300");
    // Third row: next free method is TARJETA_CREDITO.
    fireEvent.click(screen.getByText("Agregar forma de pago"));
    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.change(boxes[2], { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Recargo tarjeta (%)"), { target: { value: "10" } });
    fireEvent.change(customerSelect(), { target: { value: "c-2" } });

    // 10% of the card portion (200) = 20; the account row (300) is never surcharged.
    expect(screen.getByText("$1.020,00")).toBeInTheDocument();

    fireEvent.click(screen.getByText("VENDER"));
    expect(confirmSale).toHaveBeenCalledWith(
      [
        { method: "EFECTIVO", amount: 500 },
        { method: "CUENTA_CORRIENTE", amount: 300 },
        { method: "TARJETA_CREDITO", amount: 200 },
      ],
      "cs-1",
      0,
      10,
      "c-2",
    );
  });
});
