import { useState, useMemo, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PeriodSelector } from "../components/molecules/PeriodSelector";
import { StatsChart } from "../components/molecules/StatsChart";
import { RankedBarChart } from "../components/molecules/RankedBarChart";
import { ExportButtons } from "../components/molecules/ExportButtons";
import {
  PeriodFilter,
  getDateRange,
  filterByDateRange,
  groupByPeriod,
  calculateTotalAmount,
  formatCurrency,
  formatPeriodLabel,
  sumByPaymentMethod,
} from "../utils/statsHelpers";
import { aggregateSalesByCategory, aggregateTopProducts } from "../utils/salesAggregations";
import type { Sale } from "../models/salesModel";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";
import { useGetSales } from "../components/hooks/useSales";
import { useGetBudgets } from "../components/hooks/useBudget";
import { useOrders } from "../components/hooks/useOrder";
import { useGetReceipts } from "../components/hooks/useReceipt";
import { Loader } from "../components/atoms/loader";
import { PAYMENT_METHOD_LABELS } from "../models/cashSessionModel";

type StatType = "sales" | "budgets" | "orders" | "receipts";

interface StatisticsProps {
  type: StatType;
  onBack: () => void;
}

/** Convierte un Date a "YYYY-MM-DD" LOCAL para el value de `<input type=date>`. */
const dateToInputValue = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Parsea el "YYYY-MM-DD" de `<input type=date>` como fecha LOCAL (no
 *  `new Date(value)`, que JS interpreta como medianoche UTC y cae en el día
 *  anterior en husos negativos como Argentina, UTC-3). */
const inputValueToLocalDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const Statistics = ({ type, onBack }: StatisticsProps) => {
  const [period, setPeriod] = useState<PeriodFilter>("monthly");
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // Al salir de "Diario" se resetea a hoy, para que si el usuario vuelve más
  // tarde a Diario no arranque en un día lejano ya elegido antes.
  useEffect(() => {
    if (period !== "daily") {
      setSelectedDay(new Date());
    }
  }, [period]);

  const { sales, loading: salesLoading } = useGetSales();
  const { budgets, loading: budgetsLoading } = useGetBudgets();
  const { orders, loading: ordersLoading } = useOrders();
  const { receipts, loading: receiptsLoading } = useGetReceipts();

  const { data, loading, title, color } = useMemo(() => {
    switch (type) {
      case "sales":
        return { data: sales || [], loading: salesLoading, title: "Estadísticas de Ventas", color: "#10b981" };
      case "budgets":
        return { data: budgets || [], loading: budgetsLoading, title: "Estadísticas de Presupuestos", color: "#6366f1" };
      case "orders":
        return { data: orders || [], loading: ordersLoading, title: "Estadísticas de Pedidos", color: "#f59e0b" };
      case "receipts":
        return { data: receipts || [], loading: receiptsLoading, title: "Estadísticas de Remitos", color: "#3b82f6" };
    }
  }, [type, sales, budgets, orders, receipts, salesLoading, budgetsLoading, ordersLoading, receiptsLoading]);

  const statsData = useMemo(() => {
    if (!data.length) return { chartData: [], total: 0, count: 0 };
    const dateRange = getDateRange(period, period === "daily" ? selectedDay : undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = filterByDateRange(data as any[], dateRange);
    const grouped = groupByPeriod(filtered, period);
    const chartData = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        name: formatPeriodLabel(key, period),
        value: calculateTotalAmount(items),
        cantidad: items.length,
      }));
    return { chartData, total: calculateTotalAmount(filtered), count: filtered.length };
  }, [data, period, selectedDay]);

  // Desglose por medio de pago (solo ventas): reusa el MISMO filtro de período
  // que statsData para que los números cierren con el resto del dashboard.
  const paymentBreakdown = useMemo(() => {
    if (type !== "sales" || !data.length) return [];
    const dateRange = getDateRange(period, period === "daily" ? selectedDay : undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = filterByDateRange(data as any[], dateRange);
    return sumByPaymentMethod(filtered);
  }, [data, type, period, selectedDay]);

  // Rankings por monto (solo ventas): mismo filtro de período que statsData.
  const rankings = useMemo(() => {
    if (type !== "sales" || !data.length) return { categories: [], products: [] };
    const dateRange = getDateRange(period, period === "daily" ? selectedDay : undefined);
    const filtered = filterByDateRange(data as Sale[], dateRange);
    return {
      categories: aggregateSalesByCategory(filtered),
      products: aggregateTopProducts(filtered),
    };
  }, [data, type, period, selectedDay]);

  const totalPayments = paymentBreakdown.reduce((sum, r) => sum + r.amount, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentLabel = (m: string) => (PAYMENT_METHOD_LABELS as Record<string, any>)[m] ?? m;

  const buildExport = () => ({
    title: `Reporte de ${title}`,
    documentNumber: `RPT-${Date.now()}`,
    date: new Date().toLocaleDateString("es-AR"),
    items: statsData.chartData.map((item) => ({
      name: item.name,
      quantity: item.cantidad,
      price: item.cantidad ? item.value / item.cantidad : 0,
      total: item.value,
    })),
    total: statsData.total,
  });

  const label = title.replace("Estadísticas de ", "");
  const average = statsData.count > 0 ? statsData.total / statsData.count : 0;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <ExportButtons
          onExportPDF={() => exportToPDF(buildExport())}
          onExportExcel={() => exportToExcel(buildExport())}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector selected={period} onChange={setPeriod} />
        {period === "daily" && (
          <div className="space-y-2">
            <Label htmlFor="stats-day-filter">Elegir día</Label>
            <Input
              id="stats-day-filter"
              type="date"
              className="w-auto"
              value={dateToInputValue(selectedDay)}
              onChange={(e) => setSelectedDay(inputValueToLocalDate(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Total {label}</p>
          <p
            className="mt-1 text-3xl font-bold tracking-tight"
            style={{ color }}
            data-testid="stats-count"
          >
            {statsData.count}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Monto total</p>
          <p
            className="mt-1 text-3xl font-bold tracking-tight"
            style={{ color }}
            data-testid="stats-total"
          >
            {formatCurrency(statsData.total)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Promedio</p>
          <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color }}>
            {formatCurrency(average)}
          </p>
        </Card>
      </div>

      {type === "sales" && paymentBreakdown.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="border-b p-4">
            <h3 className="font-semibold">
              Ventas por medio de pago
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ¿cómo se vende más?
              </span>
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Medio de pago</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Distribución</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentBreakdown.map((r) => (
                <TableRow key={r.method}>
                  <TableCell className="font-medium">{paymentLabel(r.method)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalPayments > 0 ? `${((r.amount / totalPayments) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {paymentBreakdown.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {paymentBreakdown.reduce((s, r) => s + r.count, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(totalPayments)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">100%</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </Card>
      )}

      <Card className="p-5">
        <StatsChart
          data={statsData.chartData}
          title="Evolución en el tiempo"
          dataKey="value"
          color={color}
          height={360}
        />
      </Card>

      {type === "sales" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0 p-5">
            <RankedBarChart
              title="Ventas por categoría"
              note="Montos de renglones, antes de descuentos y recargos de la venta."
              data={rankings.categories}
              color={color}
            />
          </Card>
          <Card className="min-w-0 p-5">
            <RankedBarChart
              title="Productos más vendidos"
              note="Top 10 por monto, antes de descuentos y recargos de la venta."
              data={rankings.products}
              color={color}
            />
          </Card>
        </div>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b p-4">
          <h3 className="font-semibold">Detalle por período</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Monto total</TableHead>
              <TableHead className="text-right">Promedio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statsData.chartData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Sin datos para el período.
                </TableCell>
              </TableRow>
            ) : (
              statsData.chartData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.cantidad}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.value)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.cantidad ? item.value / item.cantidad : 0)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {statsData.chartData.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{statsData.count}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(statsData.total)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(average)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </div>
  );
};
