import { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePricingSettings,
  useUpdatePricingSettings,
} from "../components/hooks/usePricingSettings";
import { PricingDryRunResult } from "../services/pricingService";
import { Loader } from "../components/atoms/loader";

const formatPrice = (n: number | null): string => {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Pantalla "Configuración de precios" (sdd/venta-alimento-suelto A-01).
 *  Mirror de BrandingSettings + BulkPriceUpdate dry-run pattern. */
export const PricingSettings = () => {
  const { pricing, loading } = usePricingSettings();
  const { updatePricing, result, loading: isSaving } = useUpdatePricingSettings();

  const [factor, setFactor] = useState("");
  const [preview, setPreview] = useState<PricingDryRunResult | null>(null);

  // Seed the factor input once data arrives.
  const [seeded, setSeeded] = useState(false);
  if (pricing && !seeded) {
    setFactor(String(pricing.bulkFactor));
    setSeeded(true);
  }

  const handlePreview = () => {
    const bulkFactor = parseFloat(factor);
    if (isNaN(bulkFactor) || bulkFactor <= 0) {
      toast.error("Ingresá un factor mayor a 0");
      return;
    }
    if (Math.round(bulkFactor * 100) !== bulkFactor * 100) {
      toast.error("El factor admite hasta 2 decimales");
      return;
    }
    updatePricing(
      { bulkFactor, dryRun: true },
      {
        onSuccess: (data) => {
          const dry = data as PricingDryRunResult;
          setPreview(dry);
          if (dry.affected === 0) {
            toast.info("Ningún producto afectado (todos tienen factor propio o no tienen peso).");
          }
        },
      },
    );
  };

  const handleSave = () => {
    const bulkFactor = parseFloat(factor);
    if (isNaN(bulkFactor) || bulkFactor <= 0) {
      toast.error("Ingresá un factor mayor a 0");
      return;
    }
    if (Math.round(bulkFactor * 100) !== bulkFactor * 100) {
      toast.error("El factor admite hasta 2 decimales");
      return;
    }
    setPreview(null);
    updatePricing({ bulkFactor, dryRun: false });
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Configuración de precios
        </h1>
        <p className="text-muted-foreground">
          Ajustá el factor mayorista para el precio por kilo de los productos a
          granel. Los productos con un factor propio no se modifican.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Factor mayorista</CardTitle>
          <CardDescription>
            Multiplicador que se aplica al precio por kilo de los productos sin
            factor propio. El default del sistema es 1.20.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulkFactor">Factor</Label>
            <Input
              id="bulkFactor"
              type="number"
              step="0.01"
              min="0.01"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              placeholder="1.20"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={isSaving}
            >
              Previsualizar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar factor"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dry-run preview table (BulkPriceUpdate pattern, A-01) */}
      {preview && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>
              Vista previa — {preview.affected} producto
              {preview.affected !== 1 ? "s" : ""} afectado
              {preview.affected !== 1 ? "s" : ""}
            </CardTitle>
            <CardDescription>
              Muestra de los primeros {preview.sample.length} productos. El
              precio por kilo viejo puede ser nulo si el producto no tenía uno
              calculado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">$ x kg anterior</TableHead>
                  <TableHead className="text-right">$ x kg nuevo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[200px] truncate">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(row.oldKgPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(row.newKgPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
