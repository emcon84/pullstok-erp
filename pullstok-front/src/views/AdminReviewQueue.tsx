import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/atoms/loader";
import { Pagination } from "@/components/molecules/pagination";
import { toast } from "react-toastify";
import {
  listQueue,
  autoApply,
  approveEntry,
  rejectEntry,
  type ReviewQueueEntry,
  type ReviewQueueStatus,
  type ReviewQueueReason,
} from "@/services/priceKgReview";

/**
 * Cola de revisión de precios por kilo (sdd/precios-suelto-planilla).
 * El auto-apply de la planilla escribe los matches exactos y encola el resto
 * (difuso, manual protegido, marca sin planilla, celda huérfana). Acá el ADMIN
 * revisa cada entrada y la aprueba (aplica newPriceKg al producto) o la
 * rechaza (el precio queda intacto). La cola NO se autodescarta: una entrada
 * queda PENDING hasta que alguien la resuelve.
 */

const REASON_LABELS: Record<ReviewQueueReason, string> = {
  FUZZY_MATCH: "Coincidencia difusa",
  MANUAL_OVERRIDE: "Precio manual",
  ORPHAN_CELL: "Celda sin producto",
  BRAND_NO_PLANILLA: "Marca sin planilla",
};

const STATUS_LABELS: Record<ReviewQueueStatus, string> = {
  PENDING: "Pendientes",
  APPROVED: "Aprobadas",
  REJECTED: "Rechazadas",
};

const SPECIES_LABELS = {
  PERRO: "Perro",
  GATO: "Gato",
  AMBOS: "Perros y gatos",
} as const;

const formatPrice = (n: number | null) =>
  n === null ? "—" : `$${n.toLocaleString("es-AR")}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export const AdminReviewQueue = () => {
  const [entries, setEntries] = useState<ReviewQueueEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReviewQueueStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (p: number, st: ReviewQueueStatus) => {
      setLoading(true);
      try {
        const data = await listQueue({ status: st, page: p, limit: 10 });
        setEntries(data.items);
        setTotal(data.total);
      } catch (err: any) {
        toast.error(err?.message || "No se pudo cargar la cola");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(1, status);
  }, [status, load]);

  const handleApprove = async (entry: ReviewQueueEntry) => {
    setBusyId(entry.id);
    try {
      await approveEntry(entry.id);
      toast.success(
        `Precio aplicado a "${entry.productName ?? "producto"}" (${formatPrice(
          entry.newPriceKg,
        )})`,
      );
      load(page, status);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo aprobar la entrada");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (entry: ReviewQueueEntry) => {
    setBusyId(entry.id);
    try {
      await rejectEntry(entry.id);
      toast.success("Entrada rechazada: el precio del producto no se modificó");
      load(page, status);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo rechazar la entrada");
    } finally {
      setBusyId(null);
    }
  };

  const handleAutoApply = async () => {
    setApplying(true);
    try {
      const r = await autoApply();
      toast.success(
        `Aplicados: ${r.applied} · En cola: ${r.queued} · Omitidos: ${r.skipped}`,
      );
      load(1, status);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo aplicar la planilla");
    } finally {
      setApplying(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Revisión de precios por kilo</h1>
          <p className="text-sm text-muted-foreground">
            Aprobá o rechazá los cambios que el auto-apply de la planilla dejó
            en cola
          </p>
        </div>
        <Button
          onClick={handleAutoApply}
          disabled={applying}
          title="Corre el matching planilla↔productos: escribe los matches exactos y encola el resto"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${applying ? "animate-spin" : ""}`}
          />
          {applying ? "Aplicando..." : "Aplicar precios de planilla"}
        </Button>
      </div>

      {/* Filtro por estado */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {(["PENDING", "APPROVED", "REJECTED"] as ReviewQueueStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              status === s
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Sin entradas {STATUS_LABELS[status].toLowerCase()} en la cola
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Marca · Tipo</th>
                  <th className="px-4 py-3">Especie</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Creada</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-medium">
                      {e.productName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.brandName ?? "—"} · {e.typeName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {SPECIES_LABELS[e.species] ?? e.species}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatPrice(e.oldPriceKg)}
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-semibold">
                        {formatPrice(e.newPriceKg)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {REASON_LABELS[e.reason] ?? e.reason}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(e.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {e.status === "PENDING" ? (
                          <>
                            <Button
                              size="sm"
                              disabled={busyId === e.id}
                              onClick={() => handleApprove(e)}
                              title="Aplica el nuevo precio al producto"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === e.id}
                              onClick={() => handleReject(e)}
                              title="Descarta la entrada sin tocar el precio"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Rechazar
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {e.status === "APPROVED"
                              ? "Aprobada"
                              : "Rechazada"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => {
              setPage(p);
              load(p, status);
            }}
          />
        </>
      )}
    </div>
  );
};