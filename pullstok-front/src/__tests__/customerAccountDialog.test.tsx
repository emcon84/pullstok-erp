import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { toast } from "react-toastify";

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
    ariaLabel,
    id,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
    ariaLabel?: string;
    id?: string;
  }) => (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onValueChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/hooks/useCustomerAccount", () => ({
  useCustomerAccount: vi.fn(),
  useRegisterAccountPayment: vi.fn(),
  useGetAccountStatementLink: vi.fn(),
}));
vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(),
}));
vi.mock("@/services/saleServices", () => ({
  getSaleById: vi.fn(),
}));

import { CustomerAccountDialog } from "@/components/molecules/CustomerAccountDialog";
import {
  useCustomerAccount,
  useRegisterAccountPayment,
  useGetAccountStatementLink,
} from "@/components/hooks/useCustomerAccount";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { getSaleById } from "@/services/saleServices";

const movements = [
  {
    id: "m-2",
    type: "PAYMENT" as const,
    amount: 500,
    method: "TRANSFERENCIA" as const,
    note: "Pago parcial",
    createdAt: "2026-09-28T15:00:00.000Z",
  },
  {
    id: "m-1",
    type: "CHARGE" as const,
    amount: 1500,
    saleId: "sale-abcdef123456",
    createdAt: "2026-09-27T12:00:00.000Z",
  },
];

const setAccount = (balance: number) =>
  vi.mocked(useCustomerAccount).mockReturnValue({
    account: { customer: { id: "c-1", name: "Ana Gómez" }, balance, movements },
    loading: false,
    error: null,
  } as never);

const setSession = (session: { id: string } | null) =>
  vi.mocked(useGetCurrentCashSession).mockReturnValue({
    session,
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as never);

const registerPayment = vi.fn();
const getStatementLink = vi.fn();

const renderDialog = (customerPhone = "+5491122334455") =>
  render(
    <CustomerAccountDialog
      customerId="c-1"
      customerName="Ana Gómez"
      customerPhone={customerPhone}
      open
      onOpenChange={vi.fn()}
    />,
  );

const amountInput = () => screen.getByLabelText("Monto a cobrar") as HTMLInputElement;
const methodSelect = () => screen.getByLabelText("Método de cobro") as HTMLSelectElement;
const submit = () => screen.getByRole("button", { name: "Registrar cobranza" }) as HTMLButtonElement;

describe("CustomerAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccount(1000);
    setSession({ id: "cs-1" });
    vi.mocked(useRegisterAccountPayment).mockReturnValue({
      registerPayment,
      loading: false,
    } as never);
    vi.mocked(useGetAccountStatementLink).mockReturnValue({
      getStatementLink,
      loading: false,
    } as never);
    vi.mocked(getSaleById).mockReset();
  });

  it("shows the customer, the current balance and the movements", () => {
    renderDialog();

    expect(screen.getByText("Cuenta corriente — Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("Saldo adeudado")).toBeInTheDocument();
    expect(screen.getAllByText("$1.000,00").length).toBeGreaterThan(0);

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Cobranza")).toBeInTheDocument();
    expect(table.getByText("Transferencia")).toBeInTheDocument();
    expect(table.getByText("Pago parcial")).toBeInTheDocument();
    expect(table.getByText("Venta")).toBeInTheDocument();
    expect(table.getByText("#sale-abc")).toBeInTheDocument();
    expect(table.getByText("$1.500,00")).toBeInTheDocument();
    expect(table.getByText("$500,00")).toBeInTheDocument();
  });

  it("prefills the amount with the balance and offers only real payment methods", () => {
    renderDialog();

    expect(amountInput().value).toBe("1000");
    const options = Array.from(methodSelect().options).map((o) => o.value);
    expect(options).toEqual(["EFECTIVO", "TARJETA_CREDITO", "TARJETA_DEBITO", "TRANSFERENCIA", "QR"]);
    expect(options).not.toContain("CUENTA_CORRIENTE");
  });

  it("EFECTIVO cobranza sends the open cash session id", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: " Señal " } });

    fireEvent.click(submit());

    expect(registerPayment).toHaveBeenCalledWith(
      {
        customerId: "c-1",
        input: { amount: 300, method: "EFECTIVO", cashSessionId: "cs-1", note: "Señal" },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("non-cash cobranza does not send a cash session", () => {
    renderDialog();
    fireEvent.change(methodSelect(), { target: { value: "TRANSFERENCIA" } });

    fireEvent.click(submit());

    const [vars] = registerPayment.mock.calls[0];
    expect(vars.input).toEqual({ amount: 1000, method: "TRANSFERENCIA" });
    expect(vars.input).not.toHaveProperty("cashSessionId");
  });

  it("blocks EFECTIVO without an open cash session and shows the hint", () => {
    setSession(null);
    renderDialog();

    expect(screen.getByText("Abrí la caja para cobrar en efectivo")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    fireEvent.click(submit());
    expect(registerPayment).not.toHaveBeenCalled();

    // Other methods do not need the cash session.
    fireEvent.change(methodSelect(), { target: { value: "QR" } });
    expect(screen.queryByText("Abrí la caja para cobrar en efectivo")).not.toBeInTheDocument();
    expect(submit()).not.toBeDisabled();
  });

  it("prevents overpaying the balance client-side", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "1500" } });

    expect(screen.getByText("El monto supera el saldo adeudado")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    fireEvent.click(submit());
    expect(registerPayment).not.toHaveBeenCalled();
  });

  it("disables the submit for an empty or zero amount", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "" } });
    expect(submit()).toBeDisabled();
    fireEvent.change(amountInput(), { target: { value: "0" } });
    expect(submit()).toBeDisabled();
  });

  it("accepts a comma as the decimal separator", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "250,50" } });
    fireEvent.click(submit());
    expect(registerPayment.mock.calls[0][0].input.amount).toBe(250.5);
  });

  it("toasts on success and surfaces the server message on error", () => {
    renderDialog();
    fireEvent.click(submit());
    const [, callbacks] = registerPayment.mock.calls[0];

    callbacks.onSuccess();
    expect(toast.success).toHaveBeenCalledWith("Cobranza registrada");

    callbacks.onError(new Error("El monto supera el saldo adeudado ($10.00)"));
    expect(toast.error).toHaveBeenCalledWith("El monto supera el saldo adeudado ($10.00)");
  });

  it("hides the form when the customer owes nothing", () => {
    setAccount(0);
    renderDialog();

    expect(screen.getByText("Sin deuda pendiente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar cobranza" })).not.toBeInTheDocument();
  });

  it("shows a credit balance as 'Saldo a favor' without a form", () => {
    setAccount(-200);
    renderDialog();

    expect(screen.getByText("Saldo a favor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar cobranza" })).not.toBeInTheDocument();
  });

  // ── T2: detalle de venta expandible ──
  describe("sale detail expansion", () => {
    const saleDetail = {
      id: "sale-abcdef123456",
      totalAmount: 1500,
      saleDate: "2026-09-27T12:00:00.000Z",
      items: [
        { id: "i-1", name: "Alimento Gato 3kg", quantity: 2, price: 750, category: "Alimentos", productId: "p-1" },
      ],
    };

    it("has no expand control for PAYMENT rows", () => {
      renderDialog();
      expect(
        screen.queryByRole("button", { name: /ver detalle de la venta/i }),
      ).toBeInTheDocument(); // sanity: exists for the CHARGE row
      // The PAYMENT row's "Cobranza" cell must not be a button.
      expect(screen.getByText("Cobranza").closest("button")).toBeNull();
    });

    it("expands on click, fetches once, and shows the sale items", async () => {
      vi.mocked(getSaleById).mockResolvedValue(saleDetail as never);
      renderDialog();

      const toggle = screen.getByRole("button", { name: /ver detalle de la venta/i });
      fireEvent.click(toggle);

      expect(screen.getByText(/cargando/i)).toBeInTheDocument();
      expect(await screen.findByText("Alimento Gato 3kg")).toBeInTheDocument();
      expect(getSaleById).toHaveBeenCalledTimes(1);
      expect(getSaleById).toHaveBeenCalledWith("sale-abcdef123456");

      // Collapse then re-expand: no second fetch.
      fireEvent.click(toggle);
      expect(screen.queryByText("Alimento Gato 3kg")).not.toBeInTheDocument();
      fireEvent.click(toggle);
      expect(await screen.findByText("Alimento Gato 3kg")).toBeInTheDocument();
      expect(getSaleById).toHaveBeenCalledTimes(1);
    });

    it("shows an error state when the fetch fails", async () => {
      vi.mocked(getSaleById).mockRejectedValue(new Error("network"));
      renderDialog();

      fireEvent.click(screen.getByRole("button", { name: /ver detalle de la venta/i }));

      expect(await screen.findByText(/no se pudo cargar el detalle/i)).toBeInTheDocument();
    });
  });

  // ── T4: wa.me fallback (Kapso en sandbox — no puede enviar sin que el
  // cliente inicie la conversación; queda dormant hasta producción) ──
  describe("send statement via wa.me", () => {
    const sendButton = () =>
      screen.getByRole("button", { name: /enviar por whatsapp|abriendo whatsapp/i });
    let openSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => Window | null>>;

    beforeEach(() => {
      openSpy = vi.fn().mockReturnValue(null);
      vi.stubGlobal("open", openSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("disables the button and shows a hint when the customer has no phone", () => {
      renderDialog("   ");
      expect(sendButton()).toBeDisabled();
      expect(screen.getByText("Cargá un teléfono para enviar por WhatsApp")).toBeInTheDocument();
    });

    it("fetches the statement link and opens wa.me with the digits-only phone and the PDF url", () => {
      renderDialog("+54 9 11 2233-4455");
      expect(sendButton()).not.toBeDisabled();
      expect(
        screen.queryByText("Cargá un teléfono para enviar por WhatsApp"),
      ).not.toBeInTheDocument();

      fireEvent.click(sendButton());
      expect(getStatementLink).toHaveBeenCalledWith(
        "c-1",
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );

      const [, callbacks] = getStatementLink.mock.calls[0];
      callbacks.onSuccess({ url: "https://r2.example.com/estado-cuenta-ana.pdf", filename: "f.pdf" });

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [waUrl, target, features] = openSpy.mock.calls[0];
      expect(target).toBe("_blank");
      expect(features).toBe("noopener,noreferrer");
      expect(waUrl as string).toMatch(/^https:\/\/wa\.me\/5491122334455\?text=/);
      const decodedText = decodeURIComponent((waUrl as string).split("?text=")[1]);
      expect(decodedText).toContain("https://r2.example.com/estado-cuenta-ana.pdf");
      expect(decodedText).toContain("Ana Gómez");
    });

    it("shows a loading state while pending and does not double-fire", () => {
      vi.mocked(useGetAccountStatementLink).mockReturnValue({
        getStatementLink,
        loading: true,
      } as never);
      renderDialog();

      expect(sendButton()).toBeDisabled();
      fireEvent.click(sendButton());
      expect(getStatementLink).not.toHaveBeenCalled();
    });

    it("surfaces the server error message on failure and never opens wa.me", () => {
      renderDialog();
      fireEvent.click(sendButton());
      const [, callbacks] = getStatementLink.mock.calls[0];

      callbacks.onError(new Error("Cliente no encontrado"));
      expect(toast.error).toHaveBeenCalledWith("Cliente no encontrado");
      expect(openSpy).not.toHaveBeenCalled();
    });

    it("never calls the old Kapso-sending endpoint from this button", () => {
      renderDialog();
      fireEvent.click(sendButton());
      expect(getStatementLink).toHaveBeenCalledTimes(1);
    });
  });
});
