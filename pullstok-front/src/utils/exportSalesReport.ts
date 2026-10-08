/**
 * Renderers for the sales report. The data comes pre-computed from
 * `buildSalesReport`; here we only draw. The PDF uses jsPDF + autoTable with
 * charts drawn natively (rect / line primitives, no DOM screenshots).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import orgLogoUrl from "@/assets/logo-horizontal-almacen.png";
import type { SalesReport, ShareRow } from "./buildSalesReport";
import { formatCurrency } from "./statsHelpers";

export interface PdfLogo {
  dataUrl: string;
  width: number;
  height: number;
}

type RGB = [number, number, number];

const MARGIN = 40;
const FOOTER_SPACE = 40;
const BRAND: RGB = [16, 185, 129];
const INK: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const GRID: RGB = [229, 231, 235];
const PALETTE: RGB[] = [
  [16, 185, 129],
  [99, 102, 241],
  [245, 158, 11],
  [59, 130, 246],
  [236, 72, 153],
  [20, 184, 166],
  [168, 85, 247],
  [239, 68, 68],
  [107, 114, 128],
];
/** Above this many periods the evolution chart switches from bars to a line. */
const MAX_BARS = 31;
const MAX_COLLECTION_ROWS = 500;

const fmtPercent = (p: number) => `${p.toFixed(1).replace(".", ",")}%`;

/** Compact currency for axis labels: 1.2 M, 35 k, 800. */
const compact = (n: number): string => {
  const abs = Math.abs(n);
  const f = (v: number) => v.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (abs >= 1_000_000) return `${f(n / 1_000_000)} M`;
  if (abs >= 1_000) return `${f(n / 1_000)} k`;
  return String(Math.round(n));
};

/** Loads an asset as data URL + natural size (to keep the aspect ratio). */
export const loadLogo = async (url: string): Promise<PdfLogo | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo"));
    });
    return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  }
};

class Cursor {
  y = MARGIN;
  constructor(
    readonly doc: jsPDF,
    readonly pageW: number,
    readonly pageH: number,
  ) {}

  get contentW() {
    return this.pageW - MARGIN * 2;
  }

  /** Starts a new page when `height` does not fit in what is left. */
  ensure(height: number) {
    if (this.y + height > this.pageH - FOOTER_SPACE) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  /** Re-syncs after autoTable, which may have added pages on its own. */
  afterTable() {
    const last = (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    if (last) this.y = last.finalY + 18;
  }
}

const fit = (doc: jsPDF, text: string, maxW: number): string => {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
};

const sectionTitle = (c: Cursor, title: string, minBody = 60) => {
  c.ensure(30 + minBody);
  const { doc } = c;
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
  doc.text(title, MARGIN, c.y + 10);
  doc.setDrawColor(...BRAND).setLineWidth(1.5).line(MARGIN, c.y + 16, MARGIN + 28, c.y + 16);
  c.y += 30;
};

const table = (c: Cursor, head: string[], body: (string | number)[][], rightCols: number[], foot?: string[]) => {
  autoTable(c.doc, {
    startY: c.y,
    head: [head],
    body,
    foot: foot ? [foot] : undefined,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 3, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: [243, 244, 246], textColor: INK, fontStyle: "bold" },
    columnStyles: Object.fromEntries(rightCols.map((i) => [i, { halign: "right" }])),
    showFoot: "lastPage",
  });
  c.afterTable();
};

const drawHeader = (c: Cursor, report: SalesReport, logo: PdfLogo | null | undefined) => {
  const { doc } = c;
  let textX = MARGIN;
  if (logo) {
    const h = 36;
    const w = (logo.width / logo.height) * h;
    try {
      doc.addImage(logo.dataUrl, "PNG", MARGIN, c.y, w, h);
      textX = MARGIN + w + 14;
    } catch {
      // a broken logo must never block the report
    }
  }
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...INK);
  doc.text(report.title, textX, c.y + 16);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text(report.periodLabel, textX, c.y + 32);
  doc.setFontSize(8.5);
  doc.text(`Generado: ${report.generatedLabel}`, c.pageW - MARGIN, c.y + 16, { align: "right" });
  if (report.orgName) doc.text(report.orgName, c.pageW - MARGIN, c.y + 30, { align: "right" });
  c.y += 48;
  doc.setDrawColor(...BRAND).setLineWidth(2).line(MARGIN, c.y, c.pageW - MARGIN, c.y);
  c.y += 18;
};

const drawKpis = (c: Cursor, report: SalesReport) => {
  const { doc } = c;
  const best = report.kpis.bestPeriod;
  const cards: [string, string, string?][] = [
    ["Ventas", String(report.kpis.count)],
    ["Total vendido", formatCurrency(report.kpis.total)],
    ["Ticket promedio", formatCurrency(report.kpis.average)],
    ["Mejor período", best ? formatCurrency(best.value) : "-", best?.name],
  ];
  const gap = 8;
  const w = (c.contentW - gap * 3) / 4;
  const h = 52;
  cards.forEach(([label, value, sub], i) => {
    const x = MARGIN + i * (w + gap);
    doc.setDrawColor(...GRID).setFillColor(249, 250, 251).setLineWidth(0.8);
    doc.rect(x, c.y, w, h, "FD");
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(label, x + 8, c.y + 15);
    doc.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(...INK);
    doc.text(fit(doc, value, w - 16), x + 8, c.y + 33);
    if (sub) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
      doc.text(fit(doc, sub, w - 16), x + 8, c.y + 45);
    }
  });
  c.y += h + 22;
};

const drawEvolution = (c: Cursor, report: SalesReport) => {
  const points = report.evolution;
  if (points.length === 0) return;
  const chartH = 150;
  sectionTitle(c, "Evolución de ventas", chartH + 30);
  const { doc } = c;
  const axisW = 44;
  const x0 = MARGIN + axisW;
  const plotW = c.contentW - axisW;
  const top = c.y;
  const bottom = top + chartH;
  const max = Math.max(...points.map((p) => p.value), 1);

  // grid + y labels
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED).setLineWidth(0.5);
  for (let i = 0; i <= 4; i++) {
    const y = bottom - (chartH * i) / 4;
    doc.setDrawColor(...GRID).line(x0, y, x0 + plotW, y);
    doc.text(compact((max * i) / 4), x0 - 6, y + 2.5, { align: "right" });
  }

  const step = plotW / points.length;
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const xLabel = (i: number) => {
    if (i % labelEvery !== 0) return;
    doc.setFontSize(7).setTextColor(...MUTED);
    doc.text(fit(doc, points[i].name, step * labelEvery - 2), x0 + step * i + step / 2, bottom + 11, { align: "center" });
  };

  if (points.length <= MAX_BARS) {
    const barW = Math.min(step * 0.7, 36);
    doc.setFillColor(...BRAND);
    points.forEach((p, i) => {
      const h = (p.value / max) * chartH;
      doc.rect(x0 + step * i + (step - barW) / 2, bottom - h, barW, h, "F");
      xLabel(i);
    });
  } else {
    doc.setDrawColor(...BRAND).setLineWidth(1.4);
    points.forEach((p, i) => {
      if (i > 0) {
        const prev = points[i - 1];
        doc.line(
          x0 + step * (i - 1) + step / 2,
          bottom - (prev.value / max) * chartH,
          x0 + step * i + step / 2,
          bottom - (p.value / max) * chartH,
        );
      }
      xLabel(i);
    });
  }
  c.y = bottom + 28;
};

/** Single stacked bar showing each row's share, with a colored legend. */
const drawShareBar = (c: Cursor, rows: ShareRow[]) => {
  const { doc } = c;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return;
  c.ensure(40 + rows.length * 12);
  const barH = 14;
  let x = MARGIN;
  rows.forEach((r, i) => {
    const w = (r.amount / total) * c.contentW;
    doc.setFillColor(...PALETTE[i % PALETTE.length]);
    doc.rect(x, c.y, w, barH, "F");
    x += w;
  });
  c.y += barH + 12;
  rows.forEach((r, i) => {
    c.ensure(14);
    doc.setFillColor(...PALETTE[i % PALETTE.length]);
    doc.rect(MARGIN, c.y - 6, 7, 7, "F");
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK);
    doc.text(`${r.label} - ${fmtPercent(r.percent)}`, MARGIN + 12, c.y);
    c.y += 12;
  });
  c.y += 10;
};

/** Horizontal bars: label on the left, proportional bar, amount at the end. */
const drawHorizontalBars = (c: Cursor, rows: (ShareRow & { quantity: number })[]) => {
  const { doc } = c;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const labelW = 150;
  const amountW = 80;
  const barMax = c.contentW - labelW - amountW - 10;
  rows.forEach((r, i) => {
    c.ensure(18);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK);
    doc.text(fit(doc, r.label, labelW - 6), MARGIN, c.y + 8);
    doc.setFillColor(...PALETTE[i % PALETTE.length]);
    doc.rect(MARGIN + labelW, c.y, Math.max((r.amount / max) * barMax, 1), 10, "F");
    doc.setTextColor(...MUTED);
    doc.text(formatCurrency(r.amount), MARGIN + c.contentW, c.y + 8, { align: "right" });
    c.y += 18;
  });
  c.y += 8;
};

const drawFooters = (doc: jsPDF, report: SalesReport) => {
  const total = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRID).setLineWidth(0.5).line(MARGIN, h - 30, w - MARGIN, h - 30);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(`${report.title} - ${report.periodLabel}`, MARGIN, h - 18);
    doc.text(`Página ${i} de ${total}`, w - MARGIN, h - 18, { align: "right" });
  }
};

/** Draws the whole report and returns the (unsaved) document. */
export const renderSalesReportPdf = (report: SalesReport, logo?: PdfLogo | null): jsPDF => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const c = new Cursor(doc, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());

  drawHeader(c, report, logo);
  drawKpis(c, report);

  if (report.evolution.length === 0) {
    doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(...MUTED);
    doc.text("Sin ventas en el período seleccionado.", MARGIN, c.y + 10);
    c.y += 30;
  }

  drawEvolution(c, report);

  if (report.payments.rows.length > 0) {
    sectionTitle(c, "Medios de pago", 100);
    drawShareBar(c, report.payments.rows);
    table(
      c,
      ["Medio de pago", "Cant.", "Monto", "%"],
      report.payments.rows.map((r) => [r.label, r.count, formatCurrency(r.amount), fmtPercent(r.percent)]),
      [1, 2, 3],
      ["Total", String(report.payments.rows.reduce((s, r) => s + r.count, 0)), formatCurrency(report.payments.total), "100%"],
    );
  }

  if (report.collections) {
    const col = report.collections;
    sectionTitle(c, "Cobros de cuenta corriente", 80);
    table(
      c,
      ["Medio de pago", "Cant.", "Monto", "%"],
      col.rows.map((r) => [r.label, r.count, formatCurrency(r.amount), fmtPercent(r.percent)]),
      [1, 2, 3],
      ["Total", String(col.count), formatCurrency(col.total), "100%"],
    );
    if (col.items.length > 0) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
      c.ensure(40);
      doc.text("Detalle de cobros", MARGIN, c.y);
      c.y += 6;
      table(
        c,
        ["Fecha", "Cliente", "Medio de pago", "Monto"],
        col.items.map((it) => [it.date, it.customer, it.method, formatCurrency(it.amount)]),
        [3],
      );
      if (col.truncated) {
        doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(...MUTED);
        doc.text(`Se muestran los ${MAX_COLLECTION_ROWS} cobros más recientes; el resumen incluye todos.`, MARGIN, c.y - 8);
        c.y += 8;
      }
    }
  }

  const ranked = (title: string, rows: SalesReport["categories"]) => {
    if (rows.length === 0) return;
    sectionTitle(c, title, 60);
    drawHorizontalBars(c, rows);
    table(
      c,
      ["Nombre", "Cant.", "Monto", "%"],
      rows.map((r) => [r.label, r.quantity, formatCurrency(r.amount), fmtPercent(r.percent)]),
      [1, 2, 3],
    );
  };
  ranked("Ventas por categoría", report.categories);
  ranked("Top 10 productos", report.products);

  if (report.detail.length > 0) {
    sectionTitle(c, "Detalle por período", 80);
    table(
      c,
      ["Período", "Ventas", "Total", "Promedio"],
      report.detail.map((d) => [d.name, d.count, formatCurrency(d.total), formatCurrency(d.average)]),
      [1, 2, 3],
      ["Total", String(report.kpis.count), formatCurrency(report.kpis.total), formatCurrency(report.kpis.average)],
    );
  }

  drawFooters(doc, report);
  return doc;
};

/** Renders and downloads the PDF. `logoUrl: null` skips the logo. */
export const exportSalesReportPdf = async (
  report: SalesReport,
  logoUrl: string | null = orgLogoUrl,
): Promise<void> => {
  const logo = logoUrl ? await loadLogo(logoUrl) : null;
  renderSalesReportPdf(report, logo).save(`${report.fileName}.pdf`);
};

// ---------------------------------------------------------------- Excel

export interface SheetSpec {
  name: string;
  rows: (string | number)[][];
  widths: number[];
}

/** One sheet per section; empty sections are skipped. Amounts stay numeric. */
export const buildSalesReportSheets = (report: SalesReport): SheetSpec[] => {
  const best = report.kpis.bestPeriod;
  const sheets: SheetSpec[] = [
    {
      name: "Resumen",
      widths: [22, 34],
      rows: [
        [report.title],
        ["Período", report.periodLabel],
        ["Generado", report.generatedLabel],
        [],
        ["Ventas", report.kpis.count],
        ["Total vendido", report.kpis.total],
        ["Ticket promedio", report.kpis.average],
        ["Mejor período", best ? `${best.name} (${best.value})` : "-"],
      ],
    },
  ];

  if (report.evolution.length > 0) {
    sheets.push({
      name: "Evolución",
      widths: [22, 16],
      rows: [["Período", "Total"], ...report.evolution.map((p) => [p.name, p.value])],
    });
  }

  if (report.payments.rows.length > 0) {
    sheets.push({
      name: "Medios de pago",
      widths: [26, 10, 16, 10],
      rows: [
        ["Medio de pago", "Cant.", "Monto", "%"],
        ...report.payments.rows.map((r) => [r.label, r.count, r.amount, r.percent]),
        ["Total", report.payments.rows.reduce((s, r) => s + r.count, 0), report.payments.total, 100],
      ],
    });
  }

  if (report.collections) {
    const col = report.collections;
    const rows: (string | number)[][] = [
      ["Medio de pago", "Cant.", "Monto", "%"],
      ...col.rows.map((r) => [r.label, r.count, r.amount, r.percent]),
      ["Total", col.count, col.total, 100],
    ];
    if (col.items.length > 0) {
      rows.push([], ["Fecha", "Cliente", "Medio de pago", "Monto"]);
      rows.push(...col.items.map((it) => [it.date, it.customer, it.method, it.amount]));
      if (col.truncated) rows.push([`Se muestran los ${MAX_COLLECTION_ROWS} cobros más recientes; el resumen incluye todos.`]);
    }
    sheets.push({ name: "Cobros cta cte", widths: [26, 30, 22, 16], rows });
  }

  const ranked = (name: string, rows: SalesReport["categories"]) => {
    if (rows.length === 0) return;
    sheets.push({
      name,
      widths: [40, 12, 16, 10],
      rows: [["Nombre", "Cant.", "Monto", "%"], ...rows.map((r) => [r.label, r.quantity, r.amount, r.percent])],
    });
  };
  ranked("Categorías", report.categories);
  ranked("Top productos", report.products);

  if (report.detail.length > 0) {
    sheets.push({
      name: "Detalle",
      widths: [22, 10, 16, 16],
      rows: [
        ["Período", "Ventas", "Total", "Promedio"],
        ...report.detail.map((d) => [d.name, d.count, d.total, d.average]),
        ["Total", report.kpis.count, report.kpis.total, report.kpis.average],
      ],
    });
  }
  return sheets;
};

export const exportSalesReportExcel = (report: SalesReport): void => {
  const workbook = XLSX.utils.book_new();
  for (const sheet of buildSalesReportSheets(report)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  XLSX.writeFile(workbook, `${report.fileName}.xlsx`);
};
