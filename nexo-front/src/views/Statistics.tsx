import React, { useState, useMemo } from "react";
import { Title } from "../components/atoms/title";
import Separator from "../components/atoms/separator";
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
import { Card } from "../components/molecules/card";
import "./Statistics.css";

type StatType = "sales" | "budgets" | "orders" | "receipts";

interface StatisticsProps {
  type: StatType;
  onBack: () => void;
}

export const Statistics: React.FC<StatisticsProps> = ({ type, onBack }) => {
  const [period, setPeriod] = useState<PeriodFilter>("monthly");

  const { sales, loading: salesLoading } = useGetSales();
  const { budgets, loading: budgetsLoading } = useGetBudgets();
  const { orders, loading: ordersLoading } = useOrders();
  const { receipts, loading: receiptsLoading } = useGetReceipts();

  const { data, loading, title, color } = useMemo(() => {
    switch (type) {
      case "sales":
        return {
          data: sales || [],
          loading: salesLoading,
          title: "Estadísticas de Ventas",
          color: "#10b981",
        };
      case "budgets":
        return {
          data: budgets || [],
          loading: budgetsLoading,
          title: "Estadísticas de Presupuestos",
          color: "#6366f1",
        };
      case "orders":
        return {
          data: orders || [],
          loading: ordersLoading,
          title: "Estadísticas de Pedidos",
          color: "#f59e0b",
        };
      case "receipts":
        return {
          data: receipts || [],
          loading: receiptsLoading,
          title: "Estadísticas de Remitos",
          color: "#3b82f6",
        };
    }
  }, [
    type,
    sales,
    budgets,
    orders,
    receipts,
    salesLoading,
    budgetsLoading,
    ordersLoading,
    receiptsLoading,
  ]);

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

    const total = calculateTotalAmount(filtered);
    const count = filtered.length;

    return { chartData, total, count };
  }, [data, period]);

  const handleExportPDF = () => {
    const exportData = {
      title: `Reporte de ${title}`,
      documentNumber: `RPT-${Date.now()}`,
      date: new Date().toLocaleDateString("es-ES"),
      items: statsData.chartData.map((item) => ({
        name: item.name,
        quantity: item.cantidad,
        price: item.value / item.cantidad,
        total: item.value,
      })),
      total: statsData.total,
    };
    exportToPDF(exportData);
  };

  const handleExportExcel = () => {
    const exportData = {
      title: `Reporte de ${title}`,
      documentNumber: `RPT-${Date.now()}`,
      date: new Date().toLocaleDateString("es-ES"),
      items: statsData.chartData.map((item) => ({
        name: item.name,
        quantity: item.cantidad,
        price: item.value / item.cantidad,
        total: item.value,
      })),
      total: statsData.total,
    };
    exportToExcel(exportData);
  };

  if (loading) {
    return (
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }

  return (
    <div className="statistics-view">
      <div className="statistics-header">
        <div>
          <button onClick={onBack} className="back-button">
            ← Volver
          </button>
          <Title level={1} className="header text-xl">
            {title}
          </Title>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
        />
      </div>

      <Separator orientation="horizontal" color="#ccc" thickness="1px" />

      <div className="statistics-controls">
        <PeriodSelector selected={period} onChange={setPeriod} />
      </div>

      <div className="statistics-summary">
        <Card>
          <div className="summary-item">
            <div className="summary-label">
              Total {title.replace("Estadísticas de ", "")}
            </div>
            <div className="summary-value" style={{ color }}>
              {statsData.count}
            </div>
          </div>
        </Card>
        <Card>
          <div className="summary-item">
            <div className="summary-label">Monto Total</div>
            <div className="summary-value" style={{ color }}>
              {formatCurrency(statsData.total)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="summary-item">
            <div className="summary-label">Promedio</div>
            <div className="summary-value" style={{ color }}>
              {formatCurrency(
                statsData.count > 0 ? statsData.total / statsData.count : 0,
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="statistics-chart">
        <StatsChart
          data={statsData.chartData}
          title="Evolución en el Tiempo"
          dataKey="value"
          color={color}
          height={400}
        />
      </div>

      <div className="statistics-table">
        <Card>
          <Title level={3}>Detalle por Período</Title>
          <table className="budget-table">
            <thead>
              <tr>
                <th>Período</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th style={{ textAlign: "right" }}>Monto Total</th>
                <th style={{ textAlign: "right" }}>Promedio</th>
              </tr>
            </thead>
            <tbody>
              {statsData.chartData.map((item, index) => (
                <tr key={index}>
                  <td>{item.name}</td>
                  <td style={{ textAlign: "right" }}>{item.cantidad}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatCurrency(item.value)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatCurrency(item.value / item.cantidad)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="budget-total-row">
                <td style={{ fontWeight: "bold" }}>Total</td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                  {statsData.count}
                </td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                  {formatCurrency(statsData.total)}
                </td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                  {formatCurrency(
                    statsData.count > 0 ? statsData.total / statsData.count : 0,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </div>
    </div>
  );
};
