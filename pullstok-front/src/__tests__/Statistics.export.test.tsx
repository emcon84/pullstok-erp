import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/hooks/useSales", () => ({ useGetSales: vi.fn() }));
vi.mock("@/components/hooks/useBudget", () => ({ useGetBudgets: vi.fn() }));
vi.mock("@/components/hooks/useOrder", () => ({ useOrders: vi.fn() }));
vi.mock("@/components/hooks/useReceipt", () => ({ useGetReceipts: vi.fn() }));
vi.mock("@/components/hooks/useCustomerAccount", () => ({
  useAccountCollections: vi.fn(() => ({
    collections: {
      total: 50,
      count: 1,
      byMethod: [{ method: "EFECTIVO", count: 1, amount: 50 }],
      items: [],
      truncated: false,
    },
    loading: false,
    error: null,
  })),
}));
vi.mock("@/components/molecules/StatsChart", () => ({ StatsChart: () => <div /> }));
vi.mock("@/components/molecules/ExportButtons", () => ({
  ExportButtons: ({ onExportPDF, onExportExcel }: { onExportPDF: () => void; onExportExcel: () => void }) => (
    <div>
      <button onClick={onExportPDF}>pdf</button>
      <button onClick={onExportExcel}>excel</button>
    </div>
  ),
}));
vi.mock("@/components/atoms/loader", () => ({ Loader: () => <div /> }));

const { legacyPdf, legacyExcel, reportPdf, reportExcel } = vi.hoisted(() => ({
  legacyPdf: vi.fn(),
  legacyExcel: vi.fn(),
  reportPdf: vi.fn(),
  reportExcel: vi.fn(),
}));
vi.mock("@/utils/exportToPDF", () => ({ exportToPDF: legacyPdf }));
vi.mock("@/utils/exportToExcel", () => ({ exportToExcel: legacyExcel }));
vi.mock("@/utils/exportSalesReport", () => ({
  exportSalesReportPdf: reportPdf,
  exportSalesReportExcel: reportExcel,
}));

import { Statistics } from "@/views/Statistics";
import { useGetSales } from "@/components/hooks/useSales";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";
import { useGetReceipts } from "@/components/hooks/useReceipt";

const sale = {
  _id: "s1",
  saleDate: "2026-10-05T10:00:00",
  totalAmount: 300,
  payments: [{ method: "EFECTIVO", amount: 300 }],
  items: [{ name: "Prod A", category: "Alimento", quantity: 3, price: 100 }],
};

describe("Statistics export wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
    vi.mocked(useGetSales).mockReturnValue({ sales: [sale], loading: false, error: null } as never);
    vi.mocked(useGetBudgets).mockReturnValue({ budgets: [{ _id: "b1", createdAt: "2026-10-05T10:00:00", totalAmount: 10 }], loading: false, error: null } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [], loading: false, error: null } as never);
    vi.mocked(useGetReceipts).mockReturnValue({ receipts: [], loading: false, error: null } as never);
  });
  afterEach(() => vi.useRealTimers());

  it("sales PDF uses the rich report with the dashboard data", () => {
    render(<Statistics type="sales" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("pdf"));
    expect(legacyPdf).not.toHaveBeenCalled();
    const report = reportPdf.mock.calls[0][0];
    expect(report.kpis).toMatchObject({ count: 1, total: 300 });
    expect(report.payments.rows[0]).toMatchObject({ label: "Efectivo", amount: 300 });
    expect(report.collections?.total).toBe(50);
    expect(report.categories[0].label).toBe("Alimento");
    expect(report.products[0].label).toBe("Prod A");
    expect(report.periodLabel).toContain("Último mes");
  });

  it("sales Excel uses the rich report", () => {
    render(<Statistics type="sales" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("excel"));
    expect(legacyExcel).not.toHaveBeenCalled();
    expect(reportExcel).toHaveBeenCalledTimes(1);
  });

  it("other stat types keep the legacy export", () => {
    render(<Statistics type="budgets" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("pdf"));
    fireEvent.click(screen.getByText("excel"));
    expect(legacyPdf).toHaveBeenCalledTimes(1);
    expect(legacyExcel).toHaveBeenCalledTimes(1);
    expect(reportPdf).not.toHaveBeenCalled();
    expect(reportExcel).not.toHaveBeenCalled();
  });
});
