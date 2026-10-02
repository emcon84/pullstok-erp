import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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
    disabled,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
    ariaLabel?: string;
    id?: string;
    disabled?: boolean;
  }) => (
    <select
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
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
  useCreateHistoricalCharge: vi.fn(),
  useUpdateAccountMovement: vi.fn(),
  useDeleteAccountMovement: vi.fn(),
}));
vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(),
}));
vi.mock("@/components/hooks/useConfirm", () => ({
  useConfirm: vi.fn(),
}));
vi.mock("@/services/saleServices", () => ({
  getSaleById: vi.fn(),
}));

import { CustomerAccountDrawer } from "@/components/molecules/CustomerAccountDrawer";
import {
  useCustomerAccount,
  useRegisterAccountPayment,
  useGetAccountStatementLink,
  useCreateHistoricalCharge,
  useUpdateAccountMovement,
  useDeleteAccountMovement,
} from "@/components/hooks/useCustomerAccount";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { useConfirm } from "@/components/hooks/useConfirm";
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

const setAccount = (balance: number, list: unknown[] = movements) =>
  vi.mocked(useCustomerAccount).mockReturnValue({
    account: { customer: { id: "c-1", name: "Ana Gómez" }, balance, movements: list },
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
const createCharge = vi.fn();
const updateMovement = vi.fn();
const deleteMovement = vi.fn();
const confirm = vi.fn();

const renderDrawer = (customerPhone = "+5491122334455") =>
  render(
    <CustomerAccountDrawer
      customerId="c-1"
      customerName="Ana Gómez"
      customerPhone={customerPhone}
      open
      onOpenChange={vi.fn()}
    />,
  );

const localToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const openPayment = () => fireEvent.click(screen.getByRole("button", { name: "Cargar cobranza" }));
const amountInput = () => screen.getByLabelText("Monto a cobrar") as HTMLInputElement;
const paymentDate = () => screen.getByLabelText("Fecha de la cobranza") as HTMLInputElement;
const methodSelect = () => screen.getByLabelText("Método de cobro") as HTMLSelectElement;
const submit = () => screen.getByRole("button", { name: "Registrar cobranza" }) as HTMLButtonElement;
const saveEdit = () => screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;

describe("CustomerAccountDrawer", () => {
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
    vi.mocked(useCreateHistoricalCharge).mockReturnValue({
      createCharge,
      loading: false,
    } as never);
    vi.mocked(useUpdateAccountMovement).mockReturnValue({
      updateMovement,
      loading: false,
    } as never);
    vi.mocked(useDeleteAccountMovement).mockReturnValue({
      deleteMovement,
      loading: false,
    } as never);
    confirm.mockResolvedValue(true);
    vi.mocked(useConfirm).mockReturnValue(confirm);
    vi.mocked(getSaleById).mockReset();
  });

  it("shows the customer, the current balance and the movements", () => {
    renderDrawer();

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

  it("renders the movements table without fixed widths or forced horizontal scroll", () => {
    renderDrawer();
    const table = screen.getByRole("table");
    expect(table.className).not.toMatch(/min-w-|w-\[/);
    expect(table.closest(".overflow-x-scroll")).toBeNull();
  });

  it("hides the payment form until 'Cargar cobranza', with an empty amount and today's date", () => {
    renderDrawer();
    expect(screen.queryByLabelText("Monto a cobrar")).not.toBeInTheDocument();

    openPayment();

    expect(amountInput().value).toBe("");
    expect(paymentDate().value).toBe(localToday());
    expect(paymentDate().max).toBe(localToday());
  });

  it("'Cobrar todo' fills the amount with the full balance", () => {
    renderDrawer();
    openPayment();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar todo" }));
    expect(amountInput().value).toBe("1000");
  });

  it("offers only real payment methods", () => {
    renderDrawer();
    openPayment();

    const options = Array.from(methodSelect().options).map((o) => o.value);
    expect(options).toEqual(["EFECTIVO", "TARJETA_CREDITO", "TARJETA_DEBITO", "TRANSFERENCIA", "QR"]);
    expect(options).not.toContain("CUENTA_CORRIENTE");
  });

  it("sends a past date at local noon as ISO and omits the date for today", () => {
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.click(submit());
    expect(registerPayment.mock.calls[0][0].input).not.toHaveProperty("date");

    fireEvent.change(paymentDate(), { target: { value: "2026-09-01" } });
    fireEvent.click(submit());
    expect(registerPayment.mock.calls[1][0].input.date).toBe(
      new Date("2026-09-01T12:00:00").toISOString(),
    );
  });

  it("EFECTIVO cobranza sends the open cash session id", () => {
    renderDrawer();
    openPayment();
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
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "1000" } });
    fireEvent.change(methodSelect(), { target: { value: "TRANSFERENCIA" } });

    fireEvent.click(submit());

    const [vars] = registerPayment.mock.calls[0];
    expect(vars.input).toEqual({ amount: 1000, method: "TRANSFERENCIA" });
    expect(vars.input).not.toHaveProperty("cashSessionId");
  });

  it("blocks EFECTIVO without an open cash session and shows the hint", () => {
    setSession(null);
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "100" } });

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
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "1500" } });

    expect(screen.getByText("El monto supera el saldo adeudado")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    fireEvent.click(submit());
    expect(registerPayment).not.toHaveBeenCalled();
  });

  it("disables the submit for an empty or zero amount", () => {
    renderDrawer();
    openPayment();
    expect(submit()).toBeDisabled();
    fireEvent.change(amountInput(), { target: { value: "0" } });
    expect(submit()).toBeDisabled();
  });

  it("accepts a comma as the decimal separator", () => {
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "250,50" } });
    fireEvent.click(submit());
    expect(registerPayment.mock.calls[0][0].input.amount).toBe(250.5);
  });

  it("toasts on success (closing the form) and surfaces the server message on error", () => {
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.click(submit());
    const [, callbacks] = registerPayment.mock.calls[0];

    callbacks.onError(new Error("El monto supera el saldo adeudado ($10.00)"));
    expect(toast.error).toHaveBeenCalledWith("El monto supera el saldo adeudado ($10.00)");

    callbacks.onSuccess();
    expect(toast.success).toHaveBeenCalledWith("Cobranza registrada");
  });

  it("closes and resets the payment form after a successful cobranza", () => {
    registerPayment.mockImplementation((_vars, opts) => opts.onSuccess());
    renderDrawer();
    openPayment();
    fireEvent.change(amountInput(), { target: { value: "100" } });
    fireEvent.click(submit());

    expect(screen.queryByLabelText("Monto a cobrar")).not.toBeInTheDocument();
    openPayment();
    expect(amountInput().value).toBe("");
  });

  it("hides the form when the customer owes nothing", () => {
    setAccount(0);
    renderDrawer();

    expect(screen.getByText("Sin deuda pendiente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar cobranza" })).not.toBeInTheDocument();
  });

  it("shows a credit balance as 'Saldo a favor' without a form", () => {
    setAccount(-200);
    renderDrawer();

    expect(screen.getByText("Saldo a favor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar cobranza" })).not.toBeInTheDocument();
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
      renderDrawer();
      expect(
        screen.queryByRole("button", { name: /ver detalle de la venta/i }),
      ).toBeInTheDocument(); // sanity: exists for the CHARGE row
      // The PAYMENT row's "Cobranza" cell must not be a button.
      expect(screen.getByText("Cobranza").closest("button")).toBeNull();
    });

    it("expands on click, fetches once, and shows the sale items", async () => {
      vi.mocked(getSaleById).mockResolvedValue(saleDetail as never);
      renderDrawer();

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
      renderDrawer();

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
      renderDrawer("   ");
      expect(sendButton()).toBeDisabled();
      expect(screen.getByText("Cargá un teléfono para enviar por WhatsApp")).toBeInTheDocument();
    });

    it("fetches the statement link and opens wa.me with the digits-only phone and the PDF url", () => {
      renderDrawer("+54 9 11 2233-4455");
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
      renderDrawer();

      expect(sendButton()).toBeDisabled();
      fireEvent.click(sendButton());
      expect(getStatementLink).not.toHaveBeenCalled();
    });

    it("surfaces the server error message on failure and never opens wa.me", () => {
      renderDrawer();
      fireEvent.click(sendButton());
      const [, callbacks] = getStatementLink.mock.calls[0];

      callbacks.onError(new Error("Cliente no encontrado"));
      expect(toast.error).toHaveBeenCalledWith("Cliente no encontrado");
      expect(openSpy).not.toHaveBeenCalled();
    });

    it("never calls the old Kapso-sending endpoint from this button", () => {
      renderDrawer();
      fireEvent.click(sendButton());
      expect(getStatementLink).toHaveBeenCalledTimes(1);
    });
  });

  // ── T4b: imprimir / descargar el PDF (no requiere teléfono) ──
  describe("print / download statement", () => {
    const printButton = () =>
      screen.getByRole("button", { name: /imprimir \/ descargar pdf|generando pdf/i });
    let openSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => Window | null>>;

    beforeEach(() => {
      openSpy = vi.fn().mockReturnValue(null);
      vi.stubGlobal("open", openSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("is enabled even when the customer has no phone", () => {
      renderDrawer("   ");
      expect(printButton()).not.toBeDisabled();
    });

    it("fetches the statement link and opens the PDF url in a new tab with noopener", () => {
      renderDrawer("");
      fireEvent.click(printButton());
      expect(getStatementLink).toHaveBeenCalledWith(
        "c-1",
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );

      const [, callbacks] = getStatementLink.mock.calls[0];
      callbacks.onSuccess({ url: "https://r2.example.com/estado-cuenta-ana.pdf", filename: "f.pdf" });

      expect(openSpy).toHaveBeenCalledWith(
        "https://r2.example.com/estado-cuenta-ana.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("shows a loading state while pending and does not double-fire", () => {
      vi.mocked(useGetAccountStatementLink).mockReturnValue({
        getStatementLink,
        loading: true,
      } as never);
      renderDrawer();

      expect(printButton()).toBeDisabled();
      fireEvent.click(printButton());
      expect(getStatementLink).not.toHaveBeenCalled();
    });

    it("surfaces the server error message and never opens a tab", () => {
      renderDrawer();
      fireEvent.click(printButton());
      const [, callbacks] = getStatementLink.mock.calls[0];

      callbacks.onError(new Error("Cliente no encontrado"));
      expect(toast.error).toHaveBeenCalledWith("Cliente no encontrado");
      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe("cargar deuda anterior", () => {
    const openForm = () => fireEvent.click(screen.getByRole("button", { name: "Cargar deuda anterior" }));
    const chargeAmount = () => screen.getByLabelText("Monto de la deuda") as HTMLInputElement;
    const chargeDate = () => screen.getByLabelText("Fecha de la deuda") as HTMLInputElement;
    const chargeNote = () => screen.getByLabelText("Detalle (opcional)") as HTMLInputElement;
    const saveCharge = () => screen.getByRole("button", { name: "Guardar deuda" }) as HTMLButtonElement;

    it("hides the form until the button is pressed, then defaults the date to today with max today", () => {
      renderDrawer();
      expect(screen.queryByLabelText("Monto de la deuda")).not.toBeInTheDocument();

      openForm();

      expect(chargeDate().value).toBe(localToday());
      expect(chargeDate().max).toBe(localToday());
      expect(chargeAmount().value).toBe("");
    });

    it("is available even when the customer has no debt", () => {
      setAccount(0);
      renderDrawer();
      expect(screen.getByRole("button", { name: "Cargar deuda anterior" })).toBeInTheDocument();
    });

    it("requires an amount greater than zero", () => {
      renderDrawer();
      openForm();
      expect(saveCharge()).toBeDisabled();

      fireEvent.change(chargeAmount(), { target: { value: "0" } });
      expect(saveCharge()).toBeDisabled();

      fireEvent.change(chargeAmount(), { target: { value: "250,5" } });
      expect(saveCharge()).not.toBeDisabled();
    });

    it("sends only the amount when the date is today and there is no note", () => {
      renderDrawer();
      openForm();
      fireEvent.change(chargeAmount(), { target: { value: "700" } });
      fireEvent.click(saveCharge());

      expect(createCharge).toHaveBeenCalledTimes(1);
      expect(createCharge.mock.calls[0][0]).toEqual({ customerId: "c-1", input: { amount: 700 } });
    });

    it("sends a past date at local noon as ISO plus the trimmed note", () => {
      renderDrawer();
      openForm();
      fireEvent.change(chargeAmount(), { target: { value: "1200.50" } });
      fireEvent.change(chargeDate(), { target: { value: "2026-09-01" } });
      fireEvent.change(chargeNote(), { target: { value: "  Ventas de agosto " } });
      fireEvent.click(saveCharge());

      expect(createCharge.mock.calls[0][0]).toEqual({
        customerId: "c-1",
        input: {
          amount: 1200.5,
          date: new Date("2026-09-01T12:00:00").toISOString(),
          note: "Ventas de agosto",
        },
      });
    });

    it("toasts success and resets and closes the form on success", () => {
      createCharge.mockImplementation((_vars, opts) => opts.onSuccess());
      renderDrawer();
      openForm();
      fireEvent.change(chargeAmount(), { target: { value: "700" } });
      fireEvent.click(saveCharge());

      expect(toast.success).toHaveBeenCalledWith("Deuda anterior cargada");
      expect(screen.queryByLabelText("Monto de la deuda")).not.toBeInTheDocument();
    });

    it("toasts the server error and keeps the form open", () => {
      createCharge.mockImplementation((_vars, opts) => opts.onError(new Error("La fecha no puede ser futura")));
      renderDrawer();
      openForm();
      fireEvent.change(chargeAmount(), { target: { value: "700" } });
      fireEvent.click(saveCharge());

      expect(toast.error).toHaveBeenCalledWith("La fecha no puede ser futura");
      expect(chargeAmount().value).toBe("700");
    });
  });

  describe("cargo histórico en la lista de movimientos", () => {
    const historical = {
      id: "m-h",
      type: "CHARGE" as const,
      amount: 900,
      saleId: null,
      note: "Ventas viejas",
      createdAt: "2026-08-01T12:00:00.000Z",
    };

    it("labels a CHARGE without sale as 'Deuda anterior' with no expand toggle", () => {
      setAccount(900, [historical]);
      renderDrawer();

      const table = within(screen.getByRole("table"));
      expect(table.getByText("Deuda anterior")).toBeInTheDocument();
      expect(table.getByText("Ventas viejas")).toBeInTheDocument();
      expect(table.queryByText("Venta")).not.toBeInTheDocument();
      expect(table.queryByRole("button", { name: /ver detalle/i })).not.toBeInTheDocument();
    });
  });

  // ── Editar / borrar movimientos ──
  describe("edit and delete movements", () => {
    const historical = {
      id: "m-h",
      type: "CHARGE" as const,
      amount: 900,
      saleId: null,
      note: "Ventas viejas",
      createdAt: "2026-08-01T12:00:00.000Z",
    };
    const payment = {
      id: "m-p",
      type: "PAYMENT" as const,
      amount: 287650,
      method: "EFECTIVO" as const,
      note: "Pago",
      createdAt: "2026-09-28T15:00:00.000Z",
    };
    const sale = {
      id: "m-s",
      type: "CHARGE" as const,
      amount: 1500,
      saleId: "sale-abcdef123456",
      createdAt: "2026-09-27T12:00:00.000Z",
    };

    it("shows edit/delete only on historical charges and payments, never on sale charges", () => {
      setAccount(1000, [payment, sale, historical]);
      renderDrawer();

      expect(screen.getAllByRole("button", { name: /^Editar / })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: /^Borrar / })).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Editar cobranza" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Editar deuda anterior" })).toBeInTheDocument();
    });

    it("edits a payment pre-filled, with a read-only method, even when the balance is zero", () => {
      setAccount(0, [payment]);
      renderDrawer();
      expect(screen.queryByRole("button", { name: "Cargar cobranza" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Editar cobranza" }));

      expect(amountInput().value).toBe("287650");
      expect(paymentDate().value).toBe(new Date(payment.createdAt).toLocaleDateString("sv-SE"));
      expect((screen.getByLabelText("Nota (opcional)") as HTMLInputElement).value).toBe("Pago");
      expect(methodSelect()).toBeDisabled();
      expect(methodSelect().value).toBe("EFECTIVO");
    });

    it("saves a payment edit with amount and note, and omits the unchanged date", () => {
      setAccount(0, [payment]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Editar cobranza" }));
      fireEvent.change(amountInput(), { target: { value: "1000" } });
      fireEvent.click(saveEdit());

      expect(updateMovement).toHaveBeenCalledWith(
        { customerId: "c-1", movementId: "m-p", input: { amount: 1000, note: "Pago" } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
      expect(registerPayment).not.toHaveBeenCalled();
    });

    it("sends a changed date at local noon when editing", () => {
      setAccount(0, [payment]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Editar cobranza" }));
      fireEvent.change(paymentDate(), { target: { value: "2026-09-01" } });
      fireEvent.click(saveEdit());

      expect(updateMovement.mock.calls[0][0].input.date).toBe(
        new Date("2026-09-01T12:00:00").toISOString(),
      );
    });

    it("allows a payment edit up to balance plus the original amount", () => {
      setAccount(100, [{ ...payment, amount: 500 }]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Editar cobranza" }));

      fireEvent.change(amountInput(), { target: { value: "600" } });
      expect(saveEdit()).not.toBeDisabled();
      fireEvent.change(amountInput(), { target: { value: "601" } });
      expect(saveEdit()).toBeDisabled();
    });

    it("edits a historical charge through the debt form and closes it on success", () => {
      updateMovement.mockImplementation((_vars, opts) => opts.onSuccess());
      setAccount(900, [historical]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Editar deuda anterior" }));

      expect((screen.getByLabelText("Monto de la deuda") as HTMLInputElement).value).toBe("900");
      expect((screen.getByLabelText("Detalle (opcional)") as HTMLInputElement).value).toBe("Ventas viejas");
      fireEvent.change(screen.getByLabelText("Monto de la deuda"), { target: { value: "950" } });
      fireEvent.click(saveEdit());

      expect(updateMovement.mock.calls[0][0]).toEqual({
        customerId: "c-1",
        movementId: "m-h",
        input: { amount: 950, note: "Ventas viejas" },
      });
      expect(toast.success).toHaveBeenCalledWith("Movimiento actualizado");
      expect(screen.queryByLabelText("Monto de la deuda")).not.toBeInTheDocument();
      expect(createCharge).not.toHaveBeenCalled();
    });

    it("surfaces the server message when the edit fails and keeps the form open", () => {
      updateMovement.mockImplementation((_vars, opts) =>
        opts.onError(new Error("La caja de esta cobranza ya está cerrada")),
      );
      setAccount(0, [payment]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Editar cobranza" }));
      fireEvent.click(saveEdit());

      expect(toast.error).toHaveBeenCalledWith("La caja de esta cobranza ya está cerrada");
      expect(amountInput().value).toBe("287650");
    });

    it("asks for confirmation before deleting and deletes on accept", async () => {
      deleteMovement.mockImplementation((_vars, opts) => opts.onSuccess());
      setAccount(900, [historical]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Borrar deuda anterior" }));

      await waitFor(() => expect(deleteMovement).toHaveBeenCalledTimes(1));
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
      expect(deleteMovement.mock.calls[0][0]).toEqual({ customerId: "c-1", movementId: "m-h" });
      expect(toast.success).toHaveBeenCalledWith("Movimiento borrado");
    });

    it("does not delete when the confirmation is rejected", async () => {
      confirm.mockResolvedValue(false);
      setAccount(900, [historical]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Borrar deuda anterior" }));

      await waitFor(() => expect(confirm).toHaveBeenCalled());
      expect(deleteMovement).not.toHaveBeenCalled();
    });

    it("surfaces the server message when the delete fails", async () => {
      deleteMovement.mockImplementation((_vars, opts) =>
        opts.onError(new Error("El saldo quedaría negativo")),
      );
      setAccount(0, [payment]);
      renderDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Borrar cobranza" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("El saldo quedaría negativo"));
    });
  });
});
