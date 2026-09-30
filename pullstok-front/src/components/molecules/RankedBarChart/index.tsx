import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "../../../utils/statsHelpers";
import { truncateLabel } from "../../../utils/truncateLabel";

const MAX_LABEL = 24;

export interface RankedRowData {
  label: string;
  amount: number;
  quantity: number;
}

interface RankedBarChartProps {
  title: string;
  data: RankedRowData[];
  /** Texto pequeño y apagado bajo el título (p. ej. aclaración de montos). */
  note?: string;
  /** Color único de la serie (magnitud, no identidad categórica). */
  color?: string;
}

const ROW_HEIGHT = 34;
/** Solo las primeras N barras llevan valor directo; el resto va en tooltip/tabla. */
const LABELED_BARS = 3;

/** Eje X compacto: 1.500.000 -> "1,5 M", 12.000 -> "12 mil". */
const compactCurrency = (n: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const formatQuantity = (n: number): string =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);

interface TooltipPayload {
  payload?: RankedRowData;
}

const RankedTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="max-w-[16rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium break-words">{row.label}</p>
      <p className="tabular-nums">{formatCurrency(row.amount)}</p>
      <p className="text-muted-foreground tabular-nums">
        Cantidad: {formatQuantity(row.quantity)}
      </p>
    </div>
  );
};

/**
 * Ranking en barras horizontales: una sola serie y un solo color (magnitud),
 * ordenado por monto descendente, con vista de tabla equivalente.
 */
export const RankedBarChart = ({
  title,
  data,
  note,
  color = "#10b981",
}: RankedBarChartProps) => {
  const [asTable, setAsTable] = useState(false);
  const rows = [...data].sort(
    (a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "es"),
  );
  const summary = rows.length
    ? `${title}: ${rows.length} ${rows.length === 1 ? "elemento" : "elementos"}, el mayor es ${rows[0].label} con ${formatCurrency(rows[0].amount)}`
    : title;

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        </div>
        {rows.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            className="shrink-0 text-xs"
          >
            {asTable ? "Ver como gráfico" : "Ver como tabla"}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Sin ventas en el período
        </div>
      ) : asTable ? (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{title}</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="whitespace-normal break-words">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQuantity(r.quantity)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div role="img" aria-label={summary} className="w-full">
          <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 40}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 72, left: 0, bottom: 4 }}
              barCategoryGap={8}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeWidth={1}
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={compactCurrency}
                stroke="var(--muted-foreground)"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={128}
                tickFormatter={(v: string) => truncateLabel(v, MAX_LABEL)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={<RankedTooltip />}
              />
              <Bar
                dataKey="amount"
                fill={color}
                barSize={16}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="amount"
                  position="right"
                  fill="var(--foreground)"
                  fontSize={11}
                  formatter={(v: unknown) =>
                    v == null || v === "" ? "" : formatCurrency(Number(v))
                  }
                  valueAccessor={(entry, index) =>
                    index < LABELED_BARS ? (entry.value as number) : ""
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
