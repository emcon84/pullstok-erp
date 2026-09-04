import React from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, ClipboardList, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader } from "../components/atoms/loader";
import {
  useWhatsappDrafts,
  useRejectDraft,
} from "../components/hooks/useWhatsappOrders";
import type {
  WhatsAppOrderDraft,
  DraftItem,
} from "../models/whatsappOrderModel";

// Texto de la "cantidad/tipo" de una línea: prioriza cantidad+unidad (detail o
// peso), luego monto (ej "$15000") y por último el tipo libre capturado por el bot.
const itemQtyLabel = (item: DraftItem): string => {
  if (item.quantity != null) {
    const unit = item.detail || item.peso || item.type;
    return unit ? `x${item.quantity} ${unit}` : `x${item.quantity}`;
  }
  if (item.amount != null) return `$${item.amount.toLocaleString("es-AR")}`;
  return item.type || "";
};

// Línea de un pedido multi-producto: nombre (o "requerimiento a confirmar"),
// cantidad/tipo, total (si existe) y observación propia de la línea (si existe).
const DraftItemLine: React.FC<{ item: DraftItem }> = ({ item }) => (
  <div className="rounded-md border bg-muted/40 p-2 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="font-medium text-foreground">
        {item.productName || "Requerimiento (a confirmar)"}
      </span>
      <span className="text-xs text-muted-foreground">{itemQtyLabel(item)}</span>
      {item.total != null && (
        <span className="font-semibold">
          ${item.total.toLocaleString("es-AR")}
        </span>
      )}
    </div>
    {item.observacion && (
      <p className="mt-1 text-xs italic text-muted-foreground">
        Observación: {item.observacion}
      </p>
    )}
  </div>
);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const orderTypeLabel: Record<string, string> = {
  bolsa: "Bolsa cerrada",
  kilo: "Por kilo",
  monto: "Por monto",
  otro: "Otro",
};

const paymentLabel: Record<string, string> = {
  qr: "QR",
  transferencia: "Transferencia",
  efectivo: "Efectivo",
};

// Vista "Pedidos WhatsApp" (FASE 3): lista los borradores que el bot capturó en
// el flujo de WhatsApp. Cada fila muestra lo que el cliente dijo (producto,
// dirección, pago) y permite "Crear pedido" (navega a /pedidos con el
// `whatsappDraft` precargado para armar el pedido real y aprobarlo) o
// "Rechazar" (descarta el borrador sin crear nada).
export const WhatsappOrders: React.FC = () => {
  const { drafts, loading, error } = useWhatsappDrafts();
  const { reject } = useRejectDraft();
  const navigate = useNavigate();

  const handleCreate = (id: string) => navigate(`/pedidos?whatsappDraft=${id}`);
  const handleReject = (id: string) => {
    reject(id, {
      onSuccess: () => toast.success("Pedido de WhatsApp rechazado"),
      onError: () => toast.error("No se pudo rechazar el pedido"),
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pedidos de WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Borradores capturados por el bot Kapso mientras hacía un pedido. Armá el
          pedido real aprobándolo.
        </p>
      </div>

      {drafts.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No hay pedidos de WhatsApp pendientes.
        </Card>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const customerName =
              draft.contactName || draft.customer?.name || "Sin nombre";
            return (
              <DraftCard
                key={draft.id}
                draft={draft}
                customerName={customerName}
                onCreate={() => handleCreate(draft.id)}
                onReject={() => handleReject(draft.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const DraftCard: React.FC<{
  draft: WhatsAppOrderDraft;
  customerName: string;
  onCreate: () => void;
  onReject: () => void;
}> = ({ draft, customerName, onCreate, onReject }) => (
  <Card className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{customerName}</span>
          <Badge variant="outline" className="font-medium">
            <MessageCircle className="mr-1 h-3 w-3" />
            {draft.phone}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {orderTypeLabel[draft.orderType] || draft.orderType}
          </Badge>
        </div>

        <div className="space-y-1 text-sm">
          {Array.isArray(draft.items) && draft.items.length > 0 ? (
            <>
              <p className="font-medium text-foreground">
                Productos ({draft.items.length}):
              </p>
              <div className="space-y-2">
                {draft.items.map((item, idx) => (
                  <DraftItemLine key={`${draft.id}-item-${idx}`} item={item} />
                ))}
              </div>
            </>
          ) : (
            draft.productText && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Producto:</span>{" "}
                {draft.productText}
              </p>
            )
          )}
          {draft.notes && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Observación:</span>{" "}
              {draft.notes}
            </p>
          )}
          {draft.amount != null && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Monto:</span> $
              {draft.amount.toLocaleString("es-AR")}
            </p>
          )}
          {draft.address && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Dirección:</span>{" "}
              {draft.address}
            </p>
          )}
        </div>

        <Separator className="my-2" />

        <p className="text-xs text-muted-foreground">
          Pago: {paymentLabel[draft.paymentMethod] || draft.paymentMethod} ·
          Creado {formatDate(draft.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button onClick={onCreate}>
          <ClipboardList className="h-4 w-4" />
          Crear pedido
        </Button>
        <Button variant="outline" onClick={onReject}>
          <XCircle className="h-4 w-4" />
          Rechazar
        </Button>
      </div>
    </div>
  </Card>
);
