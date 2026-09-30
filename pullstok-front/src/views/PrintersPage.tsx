import { useState } from "react";
import { Link2, Pencil, Plus, Printer as PrinterIcon, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader } from "@/components/atoms/loader";
import { PairThisPcDialog } from "@/components/molecules/PairThisPcDialog";
import { PrinterFormDialog } from "@/components/molecules/PrinterFormDialog";
import { useBranches } from "@/components/hooks/useBranches";
import { useConfirm } from "@/components/hooks/useConfirm";
import {
  useDeletePrinter,
  usePrintAgents,
  usePrinters,
  useSavePrinter,
} from "@/components/hooks/usePrinters";
import type { PrinterData, PrinterPayload } from "@/services/printerService";

const errMsg = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * Impresoras para imprimir tickets desde el celular (ADMIN/MANAGEMENT): alta y
 * mapeo a un equipo + impresora de Windows + sucursal, estado en línea y el
 * flujo "Emparejar este equipo".
 */
export const PrintersPage = () => {
  const { data: printers = [], isLoading } = usePrinters();
  const { data: agents = [] } = usePrintAgents();
  const { branches } = useBranches();
  const save = useSavePrinter();
  const remove = useDeletePrinter();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PrinterData | null>(null);
  const [pairOpen, setPairOpen] = useState(false);

  const branchName = (id: string | null) =>
    id ? (branches.find((b) => b.id === id)?.name ?? "Sucursal") : "Todas las sucursales";

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: PrinterData) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleSave = async (data: PrinterPayload) => {
    try {
      await save.mutateAsync({ id: editing?.id, data });
      toast.success(editing ? "Impresora actualizada" : "Impresora creada");
      setFormOpen(false);
    } catch (e) {
      toast.error(errMsg(e, "No se pudo guardar la impresora"));
    }
  };

  const handleToggle = async (p: PrinterData) => {
    try {
      await save.mutateAsync({ id: p.id, data: { isActive: !p.isActive } });
    } catch (e) {
      toast.error(errMsg(e, "No se pudo actualizar la impresora"));
    }
  };

  const handleDelete = async (p: PrinterData) => {
    const ok = await confirm({
      title: "¿Eliminar impresora?",
      description: `Se elimina "${p.name}" y sus trabajos de impresión. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(p.id);
      toast.success("Impresora eliminada");
    } catch (e) {
      toast.error(errMsg(e, "No se pudo eliminar la impresora"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Impresoras</h1>
          <p className="text-sm text-muted-foreground">
            Imprimí tickets desde el celular en la térmica del local. Emparejá la PC de
            caja y asigná cada impresora a una sucursal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setPairOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            Emparejar este equipo
          </Button>
          <Button className="h-11" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva impresora
          </Button>
        </div>
      </div>

      {agents.length > 0 && (
        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-medium">Equipos</h2>
          <ul className="space-y-1 text-sm">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>{a.name}</span>
                {!a.paired ? (
                  <Badge variant="outline">Pendiente de emparejar</Badge>
                ) : a.online ? (
                  <Badge className="bg-green-600 text-white dark:bg-green-700">En línea</Badge>
                ) : (
                  <Badge variant="secondary">Sin conexión</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {printers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <PrinterIcon className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay impresoras</p>
          <p className="text-sm text-muted-foreground">
            Emparejá la PC de caja y creá la primera impresora.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {printers.map((p) => (
            <Card key={p.id} data-testid="printer-row" className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{branchName(p.branchId)}</p>
                </div>
                {p.agentOnline ? (
                  <Badge className="bg-green-600 text-white dark:bg-green-700">En línea</Badge>
                ) : (
                  <Badge variant="secondary">Sin conexión</Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {p.agent ? `${p.agent.name} → ` : "Sin equipo asignado"}
                {p.agent && (p.localName ?? "sin impresora de Windows")}
              </p>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.isActive}
                    onCheckedChange={() => void handleToggle(p)}
                    aria-label={`Activar ${p.name}`}
                  />
                  <span className="text-sm">{p.isActive ? "Activa" : "Desactivada"}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11"
                    aria-label={`Editar ${p.name}`}
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 text-destructive"
                    aria-label={`Eliminar ${p.name}`}
                    onClick={() => void handleDelete(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PrinterFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        printer={editing}
        branches={branches}
        agents={agents}
        saving={save.isPending}
        onSave={(d) => void handleSave(d)}
      />
      <PairThisPcDialog open={pairOpen} onOpenChange={setPairOpen} />
    </div>
  );
};
