import { Fragment, useState } from "react";
import { toast } from "react-toastify";
import { ChevronDown, ChevronRight, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateHistoricalCharge,
  useCustomerAccount,
  useDeleteAccountMovement,
  useGetAccountStatementLink,
  useRegisterAccountPayment,
  useUpdateAccountMovement,
} from "@/components/hooks/useCustomerAccount";
import { useConfirm } from "@/components/hooks/useConfirm";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { getSaleById } from "@/services/saleServices";
import { round2 } from "@/lib/money";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/models/cashSessionModel";
import type { AccountMovement } from "@/models/customerAccountModel";
import type { Sale } from "@/models/salesModel";

interface CustomerAccountDrawerProps {
  customerId: string;
  customerName: string;
  /** Teléfono actual del cliente (para habilitar/deshabilitar "Enviar por
   *  WhatsApp"): lo pasa el caller, que ya tiene el Customer completo. */
  customerPhone?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SaleItem = NonNullable<Sale["items"]>[number];

type SaleDetailStatus = "loading" | "done" | "error";

/** Formatea la cantidad de un renglón: kg con 2 decimales en modos sueltos
 *  (POR_PESO/POR_MONTO), unidades enteras en el resto. */
const formatItemQuantity = (item: SaleItem) => {
  const isWeightMode = item.saleMode === "POR_PESO" || item.saleMode === "POR_MONTO";
  return isWeightMode
    ? `${item.quantity.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
    : `${item.quantity} u.`;
};

const money = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

/** YYYY-MM-DD en hora local (lo que espera <input type="date">). */
const toLocalDateInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const parseAmt = (v: string) => parseFloat(v.replace(",", ".")) || 0;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
};

/** La fecha de un form viaja a mediodía local para que el huso horario no la
 *  corra de día ni la vuelva "futura"; si es hoy se omite (el server usa "ahora"). */
const dateToSend = (dateStr: string) =>
  dateStr === toLocalDateInput(new Date())
    ? {}
    : { date: new Date(`${dateStr}T12:00:00`).toISOString() };

/** Editables: deuda anterior (CHARGE sin venta) y cobranza. La venta es inmutable. */
const isEditableMovement = (m: AccountMovement) => m.type === "PAYMENT" || !m.saleId;

/** Movimiento en edición + su fecha original (para mandar `date` solo si cambió). */
interface EditingMovement {
  id: string;
  originalDate: string;
  amount: number;
}

/** wa.me fallback (Kapso en sandbox, ver useCustomerAccount): arma un link de
 *  WhatsApp con el PDF ya subido, para que el vendedor lo mande a mano. wa.me
 *  quiere solo dígitos (código de país incluido, sin "+" ni separadores). */
const buildWhatsappStatementUrl = (phone: string, customerName: string, pdfUrl: string) => {
  const digits = phone.replace(/\D/g, "");
  const message = `Hola ${customerName}! Te comparto el resumen de tu cuenta corriente: ${pdfUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

/**
 * Cuenta corriente de un cliente en un drawer: saldo, movimientos (más nuevos
 * primero), cobranza y deuda anterior (formularios colapsables). La cobranza
 * arranca vacía ("Cobrar todo" carga el saldo) y no puede superarlo (el
 * servidor también lo rechaza). Una cobranza en EFECTIVO necesita la caja
 * abierta: entra al arqueo de esa caja. Deudas anteriores y cobranzas se
 * pueden editar o borrar; las ventas no.
 */
export const CustomerAccountDrawer = ({
  customerId,
  customerName,
  customerPhone,
  open,
  onOpenChange,
}: CustomerAccountDrawerProps) => {
  const { account, loading } = useCustomerAccount(customerId);
  const { registerPayment, loading: saving } = useRegisterAccountPayment();
  const { session } = useGetCurrentCashSession();
  const { getStatementLink, loading: gettingStatementLink } = useGetAccountStatementLink();
  const { updateMovement, loading: updating } = useUpdateAccountMovement();
  const { deleteMovement, loading: deleting } = useDeleteAccountMovement();
  const confirm = useConfirm();

  const balance = account?.balance ?? 0;
  const todayStr = toLocalDateInput(new Date());

  // ── Cobranza (colapsable; también edita una cobranza existente) ──
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<EditingMovement | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [note, setNote] = useState("");

  const amount = round2(parseAmt(amountStr));
  // Al editar, el tope es el saldo + lo que esa cobranza ya descontó.
  const maxPayable = round2(balance + (editingPayment?.amount ?? 0));
  const exceedsBalance = amount > maxPayable;
  const needsCashSession = !editingPayment && method === "EFECTIVO" && !session;
  const canSubmitPayment =
    amount > 0 &&
    !exceedsBalance &&
    !needsCashSession &&
    !!paymentDate &&
    paymentDate <= todayStr &&
    !saving &&
    !updating;

  const resetPaymentForm = () => {
    setAmountStr("");
    setPaymentDate(toLocalDateInput(new Date()));
    setMethod("EFECTIVO");
    setNote("");
    setEditingPayment(null);
    setPaymentOpen(false);
  };

  const startEditPayment = (m: AccountMovement) => {
    const originalDate = toLocalDateInput(new Date(m.createdAt));
    setEditingPayment({ id: m.id, originalDate, amount: m.amount });
    setAmountStr(String(m.amount));
    setPaymentDate(originalDate);
    setMethod(m.method && m.method !== "CUENTA_CORRIENTE" ? m.method : "EFECTIVO");
    setNote(m.note ?? "");
    setPaymentOpen(true);
  };

  const handleSubmitPayment = () => {
    if (!canSubmitPayment) return;
    if (editingPayment) {
      updateMovement(
        {
          customerId,
          movementId: editingPayment.id,
          input: {
            amount,
            note: note.trim(),
            ...(paymentDate !== editingPayment.originalDate ? dateToSend(paymentDate) : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success("Movimiento actualizado");
            resetPaymentForm();
          },
          onError: (error: Error) => {
            toast.error(error.message || "Error al editar el movimiento");
          },
        },
      );
      return;
    }
    registerPayment(
      {
        customerId,
        input: {
          amount,
          method,
          ...dateToSend(paymentDate),
          ...(method === "EFECTIVO" && session ? { cashSessionId: session.id } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success("Cobranza registrada");
          resetPaymentForm();
        },
        onError: (error: Error) => {
          toast.error(error.message || "Error al registrar la cobranza");
        },
      },
    );
  };

  // ── Deuda anterior (cargo histórico sin venta; también edita una existente) ──
  const { createCharge, loading: creatingCharge } = useCreateHistoricalCharge();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<EditingMovement | null>(null);
  const [chargeAmountStr, setChargeAmountStr] = useState("");
  const [chargeDate, setChargeDate] = useState(todayStr);
  const [chargeNote, setChargeNote] = useState("");
  const chargeAmount = round2(parseAmt(chargeAmountStr));
  const canSubmitCharge =
    chargeAmount > 0 &&
    !!chargeDate &&
    chargeDate <= todayStr &&
    !creatingCharge &&
    !updating;

  const resetChargeForm = () => {
    setChargeAmountStr("");
    setChargeDate(toLocalDateInput(new Date()));
    setChargeNote("");
    setEditingCharge(null);
    setChargeOpen(false);
  };

  const startEditCharge = (m: AccountMovement) => {
    const originalDate = toLocalDateInput(new Date(m.createdAt));
    setEditingCharge({ id: m.id, originalDate, amount: m.amount });
    setChargeAmountStr(String(m.amount));
    setChargeDate(originalDate);
    setChargeNote(m.note ?? "");
    setChargeOpen(true);
  };

  const handleSubmitCharge = () => {
    if (!canSubmitCharge) return;
    if (editingCharge) {
      updateMovement(
        {
          customerId,
          movementId: editingCharge.id,
          input: {
            amount: chargeAmount,
            note: chargeNote.trim(),
            ...(chargeDate !== editingCharge.originalDate ? dateToSend(chargeDate) : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success("Movimiento actualizado");
            resetChargeForm();
          },
          onError: (error: Error) => {
            toast.error(error.message || "Error al editar el movimiento");
          },
        },
      );
      return;
    }
    createCharge(
      {
        customerId,
        input: {
          amount: chargeAmount,
          ...dateToSend(chargeDate),
          ...(chargeNote.trim() ? { note: chargeNote.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success("Deuda anterior cargada");
          resetChargeForm();
        },
        onError: (error: Error) => {
          toast.error(error.message || "Error al cargar la deuda anterior");
        },
      },
    );
  };

  const handleEdit = (m: AccountMovement) =>
    m.type === "PAYMENT" ? startEditPayment(m) : startEditCharge(m);

  const handleDelete = async (m: AccountMovement) => {
    const label = m.type === "PAYMENT" ? "cobranza" : "deuda anterior";
    const ok = await confirm({
      title: `¿Borrar ${label}?`,
      description: `Se va a borrar la ${label} de ${money(m.amount)} y el saldo se recalcula. No se puede deshacer.`,
      confirmLabel: "Borrar",
      danger: true,
    });
    if (!ok) return;
    deleteMovement(
      { customerId, movementId: m.id },
      {
        onSuccess: () => {
          toast.success("Movimiento borrado");
          // Si justo se estaba editando ese movimiento, cierra el form.
          if (editingPayment?.id === m.id) resetPaymentForm();
          if (editingCharge?.id === m.id) resetChargeForm();
        },
        onError: (error: Error) => {
          toast.error(error.message || "Error al borrar el movimiento");
        },
      },
    );
  };

  // ── Detalle de venta expandible (T2) ──
  const [expandedSaleIds, setExpandedSaleIds] = useState<Set<string>>(new Set());
  const [saleDetails, setSaleDetails] = useState<Record<string, Sale>>({});
  const [saleDetailStatus, setSaleDetailStatus] = useState<
    Record<string, SaleDetailStatus>
  >({});

  const fetchSaleDetail = async (saleId: string) => {
    setSaleDetailStatus((prev) => ({ ...prev, [saleId]: "loading" }));
    try {
      const sale = await getSaleById(saleId);
      setSaleDetails((prev) => ({ ...prev, [saleId]: sale }));
      setSaleDetailStatus((prev) => ({ ...prev, [saleId]: "done" }));
    } catch {
      setSaleDetailStatus((prev) => ({ ...prev, [saleId]: "error" }));
    }
  };

  const toggleSaleDetail = (saleId: string) => {
    const isExpanded = expandedSaleIds.has(saleId);
    setExpandedSaleIds((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
    // Solo pide la venta la primera vez que se expande (cache en saleDetails).
    if (!isExpanded && !saleDetails[saleId] && saleDetailStatus[saleId] !== "loading") {
      fetchSaleDetail(saleId);
    }
  };

  // ── Enviar comprobante por WhatsApp (T4: wa.me fallback — Kapso en sandbox
  // no puede empujar mensajes sin que el cliente haya iniciado la charla, así
  // que en vez de mandar por Kapso, armamos el PDF y abrimos WhatsApp con el
  // link ya cargado para que el vendedor lo mande con un clic) ──
  const hasPhone = !!customerPhone?.trim();
  const handleSendStatement = () => {
    if (!hasPhone || gettingStatementLink) return;
    getStatementLink(customerId, {
      onSuccess: ({ url }) => {
        const waUrl = buildWhatsappStatementUrl(customerPhone!.trim(), customerName, url);
        window.open(waUrl, "_blank", "noopener,noreferrer");
      },
      onError: (error: Error) => {
        toast.error(error.message || "Error al generar el resumen de cuenta");
      },
    });
  };

  const balanceLabel = balance > 0 ? "Saldo adeudado" : balance < 0 ? "Saldo a favor" : "Saldo";
  const balanceTone =
    balance > 0
      ? "text-destructive"
      : balance < 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";

  const paymentFormVisible = paymentOpen || !!editingPayment;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Cuenta corriente — {customerName}</SheetTitle>
          <SheetDescription>Saldo, movimientos y cobranzas del cliente.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-baseline justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">{balanceLabel}</span>
            <span className={`text-2xl font-bold tabular-nums ${balanceTone}`}>
              {money(Math.abs(balance))}
            </span>
          </div>

          <div className="space-y-1">
            <Button
              variant="outline"
              className="w-full"
              disabled={!hasPhone || gettingStatementLink}
              onClick={handleSendStatement}
            >
              {gettingStatementLink ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Abriendo WhatsApp…
                </>
              ) : (
                "Enviar por WhatsApp"
              )}
            </Button>
            {!hasPhone && (
              <p className="text-xs text-muted-foreground">
                Cargá un teléfono para enviar por WhatsApp
              </p>
            )}
          </div>

          {/* ── Cargar cobranza (con deuda, o editando una cobranza) ── */}
          {paymentFormVisible ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="account-payment-amount">Monto a cobrar</Label>
                    {!editingPayment && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setAmountStr(String(balance))}
                      >
                        Cobrar todo
                      </Button>
                    )}
                  </div>
                  <Input
                    id="account-payment-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountStr}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="text-right"
                    aria-invalid={exceedsBalance || undefined}
                  />
                  {exceedsBalance && (
                    <p className="text-xs text-destructive">El monto supera el saldo adeudado</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="account-payment-date">Fecha de la cobranza</Label>
                  <Input
                    id="account-payment-date"
                    type="date"
                    max={todayStr}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="account-payment-method">Método de cobro</Label>
                  <NativeSelect
                    id="account-payment-method"
                    ariaLabel="Método de cobro"
                    value={method}
                    disabled={!!editingPayment}
                    onValueChange={(v) => setMethod(v as PaymentMethod)}
                    options={PAYMENT_METHODS.map((m) => ({
                      value: m,
                      label: PAYMENT_METHOD_LABELS[m],
                    }))}
                  />
                  {needsCashSession && (
                    <p className="text-xs text-destructive">Abrí la caja para cobrar en efectivo</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="account-payment-note">Nota (opcional)</Label>
                  <Input
                    id="account-payment-note"
                    type="text"
                    autoComplete="off"
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={resetPaymentForm}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSubmitPayment} disabled={!canSubmitPayment}>
                  {editingPayment ? "Guardar cambios" : "Registrar cobranza"}
                </Button>
              </div>
            </div>
          ) : balance > 0 ? (
            <Button variant="outline" className="w-full" onClick={() => setPaymentOpen(true)}>
              Cargar cobranza
            </Button>
          ) : (
            balance === 0 && (
              <p className="text-center text-sm text-muted-foreground">Sin deuda pendiente</p>
            )
          )}

          {/* ── Cargar deuda anterior (ventas viejas: monto, fecha y detalle opcional) ── */}
          {chargeOpen ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="account-charge-amount">Monto de la deuda</Label>
                  <Input
                    id="account-charge-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={chargeAmountStr}
                    onChange={(e) => setChargeAmountStr(e.target.value)}
                    className="text-right"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="account-charge-date">Fecha de la deuda</Label>
                  <Input
                    id="account-charge-date"
                    type="date"
                    max={todayStr}
                    value={chargeDate}
                    onChange={(e) => setChargeDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="account-charge-note">Detalle (opcional)</Label>
                <Input
                  id="account-charge-note"
                  type="text"
                  autoComplete="off"
                  maxLength={500}
                  value={chargeNote}
                  onChange={(e) => setChargeNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={resetChargeForm}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSubmitCharge} disabled={!canSubmitCharge}>
                  {editingCharge ? "Guardar cambios" : "Guardar deuda"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setChargeOpen(true)}>
              Cargar deuda anterior
            </Button>
          )}

          {/* ── Movimientos: sin anchos fijos, la nota hace wrap (sin scroll horizontal) ── */}
          <div className="rounded-lg border">
            {loading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : !account || account.movements.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Sin movimientos todavía
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {account.movements.map((m) => {
                    const isSaleRow = m.type === "CHARGE" && !!m.saleId;
                    const saleId = m.saleId ?? "";
                    const isExpanded = isSaleRow && expandedSaleIds.has(saleId);
                    const status = isSaleRow ? saleDetailStatus[saleId] : undefined;
                    const detail = isSaleRow ? saleDetails[saleId] : undefined;
                    const methodLabel =
                      m.type === "CHARGE"
                        ? PAYMENT_METHOD_LABELS.CUENTA_CORRIENTE
                        : m.method
                          ? PAYMENT_METHOD_LABELS[m.method]
                          : "—";
                    const typeLabel =
                      m.type === "CHARGE" ? "Deuda anterior" : "Cobranza";
                    const rowLabel = m.type === "PAYMENT" ? "cobranza" : "deuda anterior";

                    return (
                      <Fragment key={m.id}>
                        <TableRow>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            {formatDate(m.createdAt)}
                          </TableCell>
                          <TableCell className="align-top whitespace-normal break-words">
                            <div className="flex flex-wrap items-center gap-x-2">
                              {isSaleRow ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSaleDetail(saleId)}
                                  aria-expanded={isExpanded}
                                  aria-label={`Ver detalle de la venta #${saleId.slice(0, 8)}`}
                                  className="flex items-center gap-1 font-medium hover:underline"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                  Venta
                                </button>
                              ) : (
                                <span className="font-medium">{typeLabel}</span>
                              )}
                              <span className="text-xs text-muted-foreground">{methodLabel}</span>
                              {m.saleId && (
                                <span className="text-xs text-muted-foreground">
                                  #{m.saleId.slice(0, 8)}
                                </span>
                              )}
                            </div>
                            {m.note && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{m.note}</p>
                            )}
                          </TableCell>
                          <TableCell
                            className={`align-top text-right tabular-nums ${
                              m.type === "CHARGE"
                                ? "text-destructive"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {money(m.amount)}
                          </TableCell>
                          <TableCell className="align-top">
                            {isEditableMovement(m) && (
                              <div className="flex gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label={`Editar ${rowLabel}`}
                                  disabled={updating || deleting}
                                  onClick={() => handleEdit(m)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  aria-label={`Borrar ${rowLabel}`}
                                  disabled={updating || deleting}
                                  onClick={() => handleDelete(m)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={4} className="bg-muted/30 p-0">
                              {status === "loading" && (
                                <p className="p-3 text-center text-xs text-muted-foreground">
                                  Cargando detalle…
                                </p>
                              )}
                              {status === "error" && (
                                <p className="p-3 text-center text-xs text-destructive">
                                  No se pudo cargar el detalle de la venta
                                </p>
                              )}
                              {status === "done" && detail?.items && (
                                <ul className="divide-y p-3 text-xs">
                                  {detail.items.map((item, idx) => (
                                    <li
                                      key={item.id ?? item._id ?? idx}
                                      className="flex items-center justify-between gap-3 py-1"
                                    >
                                      <span className="min-w-0 flex-1 break-words">{item.name}</span>
                                      <span className="shrink-0 tabular-nums text-muted-foreground">
                                        {formatItemQuantity(item)}
                                      </span>
                                      <span className="shrink-0 tabular-nums text-muted-foreground">
                                        {money(item.price)}
                                      </span>
                                      <span className="shrink-0 font-medium tabular-nums">
                                        {money(round2(item.price * item.quantity))}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
