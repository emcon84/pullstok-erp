import { Fragment, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useGetAccountStatementLink,
  useRegisterAccountPayment,
} from "@/components/hooks/useCustomerAccount";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { getSaleById } from "@/services/saleServices";
import { round2 } from "@/lib/money";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/models/cashSessionModel";
import type { Sale } from "@/models/salesModel";

interface CustomerAccountDialogProps {
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

/** wa.me fallback (Kapso en sandbox, ver useCustomerAccount): arma un link de
 *  WhatsApp con el PDF ya subido, para que el vendedor lo mande a mano. wa.me
 *  quiere solo dígitos (código de país incluido, sin "+" ni separadores). */
const buildWhatsappStatementUrl = (phone: string, customerName: string, pdfUrl: string) => {
  const digits = phone.replace(/\D/g, "");
  const message = `Hola ${customerName}! Te comparto el resumen de tu cuenta corriente: ${pdfUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

/**
 * Cuenta corriente de un cliente: saldo, movimientos (más nuevos primero) y
 * formulario de cobranza. El monto arranca en el saldo y no puede superarlo
 * (el servidor también lo rechaza). Una cobranza en EFECTIVO necesita la caja
 * abierta: entra al arqueo de esa caja.
 */
export const CustomerAccountDialog = ({
  customerId,
  customerName,
  customerPhone,
  open,
  onOpenChange,
}: CustomerAccountDialogProps) => {
  const { account, loading } = useCustomerAccount(customerId);
  const { registerPayment, loading: saving } = useRegisterAccountPayment();
  const { session } = useGetCurrentCashSession();
  const { getStatementLink, loading: gettingStatementLink } = useGetAccountStatementLink();

  const balance = account?.balance ?? 0;
  const [amountStr, setAmountStr] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [note, setNote] = useState("");

  // ── Deuda anterior (cargo histórico sin venta) ──
  const { createCharge, loading: creatingCharge } = useCreateHistoricalCharge();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeAmountStr, setChargeAmountStr] = useState("");
  const [chargeDate, setChargeDate] = useState(() => toLocalDateInput(new Date()));
  const [chargeNote, setChargeNote] = useState("");
  const chargeAmount = round2(parseAmt(chargeAmountStr));
  const todayStr = toLocalDateInput(new Date());
  const canSubmitCharge =
    chargeAmount > 0 && !!chargeDate && chargeDate <= todayStr && !creatingCharge;

  const resetChargeForm = () => {
    setChargeAmountStr("");
    setChargeDate(toLocalDateInput(new Date()));
    setChargeNote("");
    setChargeOpen(false);
  };

  const handleSubmitCharge = () => {
    if (!canSubmitCharge) return;
    // La fecha viaja a mediodía local para que el huso horario no la corra de
    // día ni la vuelva "futura"; si es hoy se omite (el server usa "ahora").
    const isToday = chargeDate === toLocalDateInput(new Date());
    createCharge(
      {
        customerId,
        input: {
          amount: chargeAmount,
          ...(isToday ? {} : { date: new Date(`${chargeDate}T12:00:00`).toISOString() }),
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

  // El monto se precarga con el saldo (y se recarga cuando cambia: p. ej. tras cobrar).
  useEffect(() => {
    setAmountStr(balance > 0 ? String(balance) : "");
  }, [balance]);

  const amount = round2(parseAmt(amountStr));
  const exceedsBalance = amount > round2(balance);
  const needsCashSession = method === "EFECTIVO" && !session;
  const canSubmit = amount > 0 && !exceedsBalance && !needsCashSession && !saving;

  const handleSubmit = () => {
    if (!canSubmit) return;
    registerPayment(
      {
        customerId,
        input: {
          amount,
          method,
          ...(method === "EFECTIVO" && session ? { cashSessionId: session.id } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success("Cobranza registrada");
          setNote("");
        },
        onError: (error: Error) => {
          toast.error(error.message || "Error al registrar la cobranza");
        },
      },
    );
  };

  const balanceLabel = balance > 0 ? "Saldo adeudado" : balance < 0 ? "Saldo a favor" : "Saldo";
  const balanceTone =
    balance > 0
      ? "text-destructive"
      : balance < 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cuenta corriente — {customerName}</DialogTitle>
          <DialogDescription>
            Saldo, movimientos y cobranzas del cliente.
          </DialogDescription>
        </DialogHeader>

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

        {/* ── Movimientos ── */}
        <div className="max-h-64 overflow-y-auto rounded-lg border">
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.movements.map((m) => {
                  const isSaleRow = m.type === "CHARGE" && !!m.saleId;
                  const saleId = m.saleId ?? "";
                  const isExpanded = isSaleRow && expandedSaleIds.has(saleId);
                  const status = isSaleRow ? saleDetailStatus[saleId] : undefined;
                  const detail = isSaleRow ? saleDetails[saleId] : undefined;

                  return (
                    <Fragment key={m.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap">{formatDate(m.createdAt)}</TableCell>
                        <TableCell>
                          {isSaleRow ? (
                            <button
                              type="button"
                              onClick={() => toggleSaleDetail(saleId)}
                              aria-expanded={isExpanded}
                              aria-label={`Ver detalle de la venta #${saleId.slice(0, 8)}`}
                              className="flex items-center gap-1 hover:underline"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                              )}
                              Venta
                            </button>
                          ) : m.type === "CHARGE" ? (
                            "Deuda anterior"
                          ) : (
                            "Cobranza"
                          )}
                        </TableCell>
                        <TableCell>
                          {m.type === "CHARGE"
                            ? PAYMENT_METHOD_LABELS.CUENTA_CORRIENTE
                            : m.method
                              ? PAYMENT_METHOD_LABELS[m.method]
                              : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            m.type === "CHARGE"
                              ? "text-destructive"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {money(m.amount)}
                        </TableCell>
                        <TableCell className="space-x-2 text-muted-foreground">
                          {m.saleId && <span>#{m.saleId.slice(0, 8)}</span>}
                          {m.note && <span>{m.note}</span>}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30 p-0">
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
                                    <span className="truncate">{item.name}</span>
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
                Guardar deuda
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setChargeOpen(true)}>
            Cargar deuda anterior
          </Button>
        )}

        {/* ── Registrar cobranza (solo con deuda) ── */}
        {balance > 0 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="account-payment-amount">Monto a cobrar</Label>
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
                <Label htmlFor="account-payment-method">Método de cobro</Label>
                <NativeSelect
                  id="account-payment-method"
                  ariaLabel="Método de cobro"
                  value={method}
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
            <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
              Registrar cobranza
            </Button>
          </div>
        ) : (
          balance === 0 && (
            <p className="text-center text-sm text-muted-foreground">Sin deuda pendiente</p>
          )
        )}
      </DialogContent>
    </Dialog>
  );
};
