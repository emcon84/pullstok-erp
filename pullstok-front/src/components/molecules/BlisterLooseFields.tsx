import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface BlisterLooseFieldsProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  pieces: number;
  onPiecesChange: (pieces: number) => void;
}

/**
 * sdd/venta-pastillas-sueltas-blister — switch "Vender pastillas sueltas" +
 * input "Pastillas por blister" (solo con el switch activo). Compartido por el
 * modal de escaneo (UnifiedPos) y el diálogo del buscador (VendorCatalogTab)
 * para que ambos flujos tengan exactamente el mismo contrato de UI.
 */
export const BlisterLooseFields = ({
  checked,
  onCheckedChange,
  pieces,
  onPiecesChange,
}: BlisterLooseFieldsProps) => (
  <>
    <div className="flex items-center gap-2">
      <Switch
        id="sell-loose-blister"
        checked={checked}
        onCheckedChange={(v) => {
          onCheckedChange(v);
          if (!v) onPiecesChange(0);
        }}
      />
      <Label htmlFor="sell-loose-blister" className="cursor-pointer text-sm font-medium">
        Vender pastillas sueltas
      </Label>
    </div>

    {checked && (
      <div className="space-y-1.5">
        <Label htmlFor="pieces-per-blister-input">Pastillas por blister</Label>
        <Input
          id="pieces-per-blister-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={pieces || ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
            onPiecesChange(digits === "" ? 0 : parseInt(digits, 10));
          }}
          className="h-9 w-20 text-center tabular-nums"
        />
      </div>
    )}
  </>
);
