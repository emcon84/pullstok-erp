import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ExportButtons } from "../ExportButtons";

interface DocItem {
  quantity?: number;
  name?: string;
  price?: number;
}

interface DocumentCardProps {
  label: string;
  title: string;
  subtitle?: string;
  items: DocItem[];
  total: number;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  badge?: ReactNode;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;

export const DocumentCard = ({
  label,
  title,
  subtitle,
  items,
  total,
  onExportPDF,
  onExportExcel,
  badge,
}: DocumentCardProps) => {
  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {badge}
          </div>
          <p className="font-semibold">{title}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {(onExportPDF || onExportExcel) && (
          <ExportButtons
            onExportPDF={onExportPDF ?? (() => {})}
            onExportExcel={onExportExcel ?? (() => {})}
          />
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-16 px-3 py-2 text-center font-medium">Cant.</th>
              <th className="py-2 text-left font-medium">Producto</th>
              <th className="py-2 text-right font-medium">P. unit.</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-center tabular-nums">
                  {it.quantity ?? 1}
                </td>
                <td className="py-2">{it.name}</td>
                <td className="py-2 text-right tabular-nums">
                  {money(it.price ?? 0)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money((it.quantity ?? 1) * (it.price ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 border-t pt-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-bold tabular-nums">{money(total)}</span>
      </div>
    </Card>
  );
};
