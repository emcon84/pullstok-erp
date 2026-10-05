import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PresentationRow } from "@/components/hooks/usePresentationsEditor";

interface PresentationsSectionProps {
  /** Presentations already enabled for the product (save/disable) or not (enable). */
  enabled: boolean;
  rows: PresentationRow[];
  error: string | null;
  busy: boolean;
  isBase: (row: PresentationRow) => boolean;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onChange: (key: string, patch: Partial<Pick<PresentationRow, "name" | "factor" | "price" | "wholesalePrice">>) => void;
  onSave: () => void;
  onRequestEnable: () => void;
  onDisable: () => void;
}

/** Presentational editor of a product's presentations (pack sizes). */
export const PresentationsSection = ({
  enabled,
  rows,
  error,
  busy,
  isBase,
  onAdd,
  onRemove,
  onMove,
  onChange,
  onSave,
  onRequestEnable,
  onDisable,
}: PresentationsSectionProps) => (
  <div className="space-y-3 rounded-lg border p-3">
    <div>
      <Label className="text-sm font-semibold">Presentaciones</Label>
      <p className="text-[11px] text-muted-foreground">
        {enabled
          ? "El stock se guarda en unidades base (factor 1). Los precios se cargan a mano en cada presentación."
          : "Vendé este producto por caja, blister o pastilla. Habilitalas indicando cuántas unidades trae cada una."}
      </p>
    </div>

    {enabled && (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const n = i + 1;
        const base = isBase(row);
        return (
          <div key={row.key} className="space-y-2 rounded-md border bg-muted/20 p-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label={`Nombre de presentación ${n}`}
                placeholder="Nombre (ej: Caja)"
                value={row.name}
                onChange={(e) => onChange(row.key, { name: e.target.value })}
              />
              <Input
                aria-label={`Factor de presentación ${n}`}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="Unidades base"
                value={row.factor}
                disabled={base}
                onChange={(e) => onChange(row.key, { factor: e.target.value })}
              />
              <Input
                aria-label={`Precio de presentación ${n}`}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Precio"
                value={row.price}
                onChange={(e) => onChange(row.key, { price: e.target.value })}
              />
              <Input
                aria-label={`Precio mayorista de presentación ${n}`}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Mayorista (opcional)"
                value={row.wholesalePrice}
                onChange={(e) => onChange(row.key, { wholesalePrice: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {base ? "Unidad base (factor fijo en 1)" : ""}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Subir presentación ${n}`}
                  disabled={i === 0}
                  onClick={() => onMove(row.key, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Bajar presentación ${n}`}
                  disabled={i === rows.length - 1}
                  onClick={() => onMove(row.key, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                {!base && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    aria-label={`Quitar presentación ${n}`}
                    onClick={() => onRemove(row.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
    )}

    {enabled && (
      <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={busy}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Agregar presentación
      </Button>
    )}

    {error && (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )}

    <div className="flex flex-wrap gap-2">
      {enabled ? (
        <>
          <Button type="button" size="sm" onClick={onSave} disabled={busy}>
            Guardar presentaciones
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDisable} disabled={busy}>
            Deshabilitar presentaciones
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" onClick={onRequestEnable} disabled={busy}>
          Habilitar presentaciones
        </Button>
      )}
    </div>
  </div>
);
