import { useState, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ExportButtons } from "../components/molecules/ExportButtons";
import {
  PeriodFilter,
  getDateRange,
  filterByDateRange,
  groupByPeriod,
  calculateTotalAmount,
  formatCurrency,
  formatPeriodLabel,
} from "../utils/statsHelpers";
import { exportToPDF } from "../utils/exportToPDF";
import { exportToExcel } from "../utils/exportToExcel";
import { useGetSales } from "../components/hooks/useSales";
import { useGetBudgets } from "../components/hooks/useBudget";
import { useOrders } from "../components/hooks/useOrder";
import { useGetReceipts } from "../components/hooks/useReceipt";
import { Loader } from "../components/atoms/loader";

type StatType = "sales" | "budgets" | "orders" | "receipts";

interface StatisticsProps {
  type: StatType;
  onBack: () => void;
}

export const Statistics = ({ type, onBack }: StatisticsProps) => {
  const [period, setPeriod] = useState<PeriodFilter>("monthly");

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
    const dateRange = getDateRange(period);
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
  }, [data, period]);

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

      <PeriodSelector selected={period} onChange={setPeriod} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Total {label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color }}>
            {statsData.count}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Monto total</p>
          <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color }}>
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

      <Card className="p-5">
        <StatsChart
          data={statsData.chartData}
          title="Evolución en el tiempo"
          dataKey="value"
          color={color}
          height={360}
        />
      </Card>

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
