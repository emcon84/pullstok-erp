import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PriceListDetail } from "@/services/priceLists";
import { groupByPdfHierarchy } from "@/lib/printGrouping";
import { useBrandingContext } from "@/contexts/BrandingContext";

interface PrintPriceListProps {
  plan: PriceListDetail;
}

const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `$ ${Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const formatPeriod = (period: string | null) =>
  period ? ` · vigencia ${period}` : " · sin vigencia";

/**
 * Área imprimible de la planilla mayorista (sdd/alican-wholesale-price-list):
 * logo de la empresa (BrandingContext.logoUrl, fallback displayName si la
 * imagen no carga), jerarquía DEL PDF (marca → línea → sublínea) y por
 * producto 2 columnas: Precio (Con IVA del proveedor) y Sugerido ("—" si no
 * hay). Mismo patrón print-area que PrintProductList/PrintBulkPriceList.
 */
export const PrintPriceList = ({ plan }: PrintPriceListProps) => {
  const { branding } = useBrandingContext();
  const [logoFailed, setLogoFailed] = useState(false);
  const sections = groupByPdfHierarchy(plan.sections);

  return (
    <div className="print-area hidden print:block" aria-hidden="true">
      <div className="mb-4 flex items-center gap-3">
        {branding.logoUrl && !logoFailed && (
          <img
            src={branding.logoUrl}
            alt="Logo"
            className="h-12 w-12 object-contain"
            data-testid="print-logo"
            onError={() => setLogoFailed(true)}
          />
        )}
        <div>
          <h1 className="text-lg font-bold">
            {logoFailed || !branding.logoUrl
              ? branding.displayName || "Pullstok"
              : "Planilla mayorista"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {plan.type}
            {formatPeriod(plan.period)} · {plan.sections.length} secciones
          </p>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.id} className="mb-6 break-inside-avoid">
          {(section.brand || section.line || section.subline) && (
            <h2 className="mb-2 border-b pb-1 text-base font-bold uppercase">
              {[section.brand, section.line, section.subline]
                .filter(Boolean)
                .join(" · ")}
            </h2>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Sugerido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium leading-tight">
                    {entry.name}
                    {entry.unit ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({entry.unit})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(entry.priceConIva)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(entry.suggestedPrice)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
};
