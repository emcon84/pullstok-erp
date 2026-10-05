import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildQuickSetup,
  quickSetupFactors,
  type QuickSetupPresentation,
} from "@/components/hooks/presentationHelpers";

interface EnablePresentationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current product stock, expressed in the unit it was counted in so far. */
  currentStock: number;
  /** Product price: prefill for the Pastilla (base) price. */
  basePrice: number;
  /** Legacy "<name> (Blister)" duplicate found in the loaded catalog (prefills Blister). */
  legacyBlister: { name: string; price: number } | null;
  busy: boolean;
  error: string | null;
  onConfirm: (presentations: QuickSetupPresentation[], stockCountedIn: string) => void;
}

const PRESENTATION_NAMES = ["Caja", "Blister", "Pastilla"] as const;

/** Quick setup for the typical pharmacy case (Caja > Blister > Pastilla): asks the
 *  pack counts and the manual prices, and which presentation the current stock
 *  was counted in, previewing the base-unit conversion. */
export const EnablePresentationsDialog = ({
  open,
  onOpenChange,
  currentStock,
  basePrice,
  legacyBlister,
  busy,
  error,
  onConfirm,
}: EnablePresentationsDialogProps) => {
  const [blistersPerBox, setBlistersPerBox] = useState("");
  const [pillsPerBlister, setPillsPerBlister] = useState("");
  const [prices, setPrices] = useState({ box: "", blister: "", pill: "" });
  const [counted, setCounted] = useState<(typeof PRESENTATION_NAMES)[number]>("Caja");
  const [localError, setLocalError] = useState<string | null>(null);

  // Fresh form (with prefills) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setBlistersPerBox("");
    setPillsPerBlister("");
    setPrices({
      box: "",
      blister: legacyBlister ? String(legacyBlister.price) : "",
      pill: String(basePrice),
    });
    setCounted("Caja");
    setLocalError(null);
  }, [open, legacyBlister, basePrice]);

  const factors = quickSetupFactors(blistersPerBox, pillsPerBlister);
  const factorOf = { Caja: factors?.box, Blister: factors?.blister, Pastilla: factors?.pill };
  const countedFactor = factorOf[counted];

  const handleConfirm = () => {
    try {
      onConfirm(buildQuickSetup({ blistersPerBox, pillsPerBlister, prices }), counted);
      setLocalError(null);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Revisá los datos");
    }
  };

  const priceInput = (key: keyof typeof prices, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        aria-label={`Precio de ${label}`}
        type="number"
        inputMode="decimal"
        min="0"
        value={prices[key]}
        onChange={(e) => setPrices((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  const shownError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Habilitar presentaciones</DialogTitle>
          <DialogDescription>
            Indicá cuántas unidades trae cada presentación y cargá el precio de cada una.
            Los precios no se calculan: se usan tal cual los escribas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Blisters por caja</Label>
            <Input
              aria-label="Blisters por caja"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={blistersPerBox}
              onChange={(e) => setBlistersPerBox(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pastillas por blister</Label>
            <Input
              aria-label="Pastillas por blister"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={pillsPerBlister}
              onChange={(e) => setPillsPerBlister(e.target.value)}
            />
          </div>
          {priceInput("box", "Caja")}
          <div className="space-y-1">
            {priceInput("blister", "Blister")}
            {legacyBlister && (
              <p className="text-[11px] text-muted-foreground">
                {`Precio tomado de «${legacyBlister.name}»`}
              </p>
            )}
          </div>
          {priceInput("pill", "Pastilla")}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm">¿En qué presentación venías contando el stock actual?</legend>
          {PRESENTATION_NAMES.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="stock-counted-in"
                value={name}
                checked={counted === name}
                onChange={() => setCounted(name)}
              />
              <span>
                {name}
                {factorOf[name] ? (
                  <span className="text-muted-foreground"> (x{factorOf[name]})</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        {countedFactor && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">
            {`Stock actual ${currentStock} → ${currentStock * countedFactor} unidades base`}
          </p>
        )}

        {shownError && (
          <p role="alert" className="text-sm text-destructive">
            {shownError}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? "Habilitando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
