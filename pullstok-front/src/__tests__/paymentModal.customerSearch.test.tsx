import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// The payment-method select wraps shadcn Select (needs matchMedia in jsdom):
// a plain <select> keeps it deterministic. The customer picker stays REAL.
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
    <select data-testid="method" value={value} onChange={(e) => onValueChange(e.target.value)}>
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
  { id: "c-1", name: "ZULEMA PEREZ", email: "", phone: "" },
  { id: "c-2", name: "ALVARO MARTINEZ", email: "", phone: "" },
  { id: "c-3", name: "ANA MARIA ALEGRE", email: "", phone: "" },
];

const setup = (confirmSale = vi.fn()) => {
  render(
    <PaymentModal
      open
      onOpenChange={vi.fn()}
      total={1000}
      cashSessionId="cs-1"
      discountPct={0}
      confirmSale={confirmSale}
    />,
  );
  fireEvent.click(screen.getByText("Agregar forma de pago"));
  const methods = screen.getAllByTestId("method");
  fireEvent.change(methods[1], { target: { value: "CUENTA_CORRIENTE" } });
  const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
  fireEvent.change(boxes[1], { target: { value: "400" } });
  return confirmSale;
};

const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("combobox", { name: CUSTOMER_LABEL }));
  return screen.getByPlaceholderText("Buscar cliente…");
};

describe("PaymentModal — customer search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCustomers).mockReturnValue({
      customers,
      loadingCustomer: false,
      errorCustomer: null,
    } as never);
  });

  it("filters the customers while typing, ignoring case and accents", async () => {
    const user = userEvent.setup();
    setup();
    const search = await openPicker(user);

    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(3);
    await user.type(search, "álvaro");

    const visible = within(list).getAllByRole("option");
    expect(visible).toHaveLength(1);
    expect(visible[0]).toHaveTextContent("ALVARO MARTINEZ");
  });

  it("sells to the customer picked from the filtered list", async () => {
    const user = userEvent.setup();
    const confirmSale = setup();
    const search = await openPicker(user);
    await user.type(search, "zule");
    await user.click(screen.getByRole("option", { name: /ZULEMA PEREZ/ }));

    fireEvent.click(screen.getByText("VENDER"));

    expect(confirmSale).toHaveBeenCalledWith(
      [
        { method: "EFECTIVO", amount: 600 },
        { method: "CUENTA_CORRIENTE", amount: 400 },
      ],
      "cs-1",
      0,
      0,
      "c-1",
    );
  });

  it("typing shortcut letters in the search does not sell nor change the rows", async () => {
    const user = userEvent.setup();
    const confirmSale = setup();
    const search = await openPicker(user);

    await user.type(search, "v+-1");

    expect(confirmSale).not.toHaveBeenCalled();
    expect(search).toHaveValue("v+-1");
    expect(screen.getAllByTestId("method")).toHaveLength(2);
  });

  it("Enter picks the highlighted customer without adding a payment row", async () => {
    const user = userEvent.setup();
    const confirmSale = setup();
    const search = await openPicker(user);
    await user.type(search, "ana");
    await user.keyboard("{Enter}");

    expect(screen.getAllByTestId("method")).toHaveLength(2);
    fireEvent.click(screen.getByText("VENDER"));
    expect(confirmSale).toHaveBeenCalledWith(expect.any(Array), "cs-1", 0, 0, "c-3");
  });
});
