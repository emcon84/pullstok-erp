import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BranchData } from "@/services/branchService";
import type { PrintAgentData, PrinterData, PrinterPayload } from "@/services/printerService";

interface PrinterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = alta. */
  printer: PrinterData | null;
  branches: BranchData[];
  agents: PrintAgentData[];
  saving: boolean;
  onSave: (data: PrinterPayload) => void;
}

const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:text-sm";

/**
 * Alta/edición de una impresora: nombre, sucursal, equipo (agente) y la
 * impresora de Windows de ese equipo (la lista sale del latido del agente).
 */
export function PrinterFormDialog(props: PrinterFormDialogProps) {
  // Se remonta por impresora (key) para no arrastrar estado entre ediciones.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.printer ? "Editar impresora" : "Nueva impresora"}</DialogTitle>
        </DialogHeader>
        <PrinterForm key={props.printer?.id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function PrinterForm({ printer, branches, agents, saving, onSave }: PrinterFormDialogProps) {
  const [name, setName] = useState(printer?.name ?? "");
  const [branchId, setBranchId] = useState(printer?.branchId ?? "");
  const [agentId, setAgentId] = useState(printer?.agentId ?? "");
  const [localName, setLocalName] = useState(printer?.localName ?? "");
  const [isActive, setIsActive] = useState(printer?.isActive ?? true);

  const agent = agents.find((a) => a.id === agentId);
  const localOptions = [...(agent?.localPrinters ?? [])];
  // Conserva un mapeo previo aunque el agente ya no lo reporte.
  if (localName && !localOptions.includes(localName)) localOptions.push(localName);

  const handleSave = () =>
    onSave({
      name: name.trim(),
      branchId: branchId || null,
      agentId: agentId || null,
      localName: agentId ? localName || null : null,
      isActive,
    });

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="printer-name">Nombre</Label>
        <Input
          id="printer-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Caja 1"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="printer-branch">Sucursal</Label>
        <select
          id="printer-branch"
          className={selectClass}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="">Todas / sin sucursal</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="printer-agent">Equipo</Label>
        <select
          id="printer-agent"
          className={selectClass}
          value={agentId}
          onChange={(e) => {
            setAgentId(e.target.value);
            setLocalName("");
          }}
        >
          <option value="">Sin equipo</option>
          {agents
            .filter((a) => a.paired)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="printer-local">Impresora de Windows</Label>
        <select
          id="printer-local"
          className={selectClass}
          value={localName}
          disabled={!agentId}
          onChange={(e) => setLocalName(e.target.value)}
        >
          <option value="">Elegí una impresora</option>
          {localOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {agentId && localOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            El equipo todavía no informó sus impresoras. Esperá unos segundos a que esté en línea.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="printer-active">Activa</Label>
        <Switch id="printer-active" checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <Button className="h-12 w-full" onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? "Guardando..." : "Guardar"}
      </Button>
    </div>
  );
}
