import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductPresentation } from "@/types";
import { levelsToBaseUnits, toStockLevels } from "@/components/hooks/presentationHelpers";

interface LevelStockInputProps {
  /** Branch name, used for accessible labels ("Caja de Casa Central"). */
  label: string;
  /** Current stock of the branch in BASE units. */
  quantity: number;
  presentations: ProductPresentation[];
  saving: boolean;
  /** Receives the typed levels converted to base units. */
  onSave: (baseQuantity: number) => void;
}

const seedCounts = (quantity: number, presentations: ProductPresentation[]) => {
  const counts: Record<string, string> = Object.fromEntries(presentations.map((p) => [p.name, "0"]));
  for (const level of toStockLevels(quantity, presentations)) counts[level.name] = String(level.count);
  return counts;
};

/** Level-aware stock editor: one count per presentation, sent as base units. */
export const LevelStockInput = ({ label, quantity, presentations, saving, onSave }: LevelStockInputProps) => {
  const ordered = useMemo(() => [...presentations].sort((a, b) => b.factor - a.factor), [presentations]);
  const [counts, setCounts] = useState(() => seedCounts(quantity, ordered));

  // Re-seed when the server value changes (after a save/refetch).
  useEffect(() => {
    setCounts(seedCounts(quantity, ordered));
  }, [quantity, ordered]);

  const total = levelsToBaseUnits(
    Object.fromEntries(ordered.map((p) => [p.name, parseInt(counts[p.name] ?? "", 10)])),
    ordered,
  );

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {ordered.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-0.5">
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              aria-label={`${p.name} de ${label}`}
              className="w-16"
              value={counts[p.name] ?? ""}
              onChange={(e) => setCounts((prev) => ({ ...prev, [p.name]: e.target.value }))}
            />
            <span className="text-[10px] text-muted-foreground">{p.name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{`= ${total} unidades base`}</span>
        <Button size="sm" variant="outline" onClick={() => onSave(total)} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
};
