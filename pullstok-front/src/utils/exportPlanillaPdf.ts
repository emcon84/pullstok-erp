/**
 * Generación de la planilla mayorista en PDF con jsPDF + autoTable (texto real,
 * buscable). Usa los helpers compartidos de planillaGroups para que el diseño
 * (seco/húmedo → marca → talla → razas) sea idéntico al de la actualización.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PriceListDetail, PriceListEntryDetail } from "@/services/priceLists";
import { groupByPdfHierarchy } from "@/lib/printGrouping";
import orgLogoUrl from "@/assets/logo-horizontal-almacen.png";
import {
  formatPrice,
  redondearPrecio,
  normalizeLine,
  displayName,
  isNonFood,
  esHumedito,
  tallaOf,
  abbreviateCategoria,
  subCategoryFromName,
  gamaBySpecies,
  BRAND_COLORS,
} from "./planillaGroups";

/** Precio mayorista = sin IVA + 21% (IVA) + 15% de ganancia (todos). La base
 * para la actualización masiva NO lleva el 15% (se guarda aparte). */
const precioMayorista = (sinIva: number | null | undefined): number | null =>
  sinIva == null ? null : redondearPrecio(Math.round(sinIva * 1.21 * 1.15 * 100) / 100);

/** Margen al público: el Sugerido se deriva del Precio mayorista × este factor. */
const SUGERIDO_FACTOR = 1.3334;

/** Sugerido = Precio mayorista (con el +15%) × margen al público. */
const publico = (sinIva: number | null | undefined): number | null => {
  const mayorista = precioMayorista(sinIva);
  return mayorista == null ? null : redondearPrecio(Math.round(mayorista * SUGERIDO_FACTOR * 100) / 100);
};

/** Carga un asset local como data URL + tamaño natural (para no deformar). */
const loadLogo = async (
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
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

const ROW_STYLES = { fontSize: 8.5, cellPadding: 2.5, textColor: [0, 0, 0] as [number, number, number] };

export interface GroupRow {
  content: string | number;
  colSpan?: number;
  rowSpan?: number;
  label?: string;
  styles?: Record<string, unknown>;
}

/**
 * Formato estilo planilla (Excel de referencia): fila de grupo por sección,
 * columna Categoría/Talla, y columnas Descripción / KG / Precio / Sugerido.
 * Precios: los cálculos existentes (mayorista y público). Solo cambia el orden.
 */
const buildBody = (plan: PriceListDetail): (string | GroupRow)[][] => {
  const sections = groupByPdfHierarchy(
    plan.sections.map((s) => ({ ...s, line: normalizeLine(s.line) })),
  ).filter((s) => !/^IVA$/i.test(s.subline ?? ""));

  const cols = 5;
  const body: (string | GroupRow)[][] = [];

  const flat: { e: PriceListEntryDetail; brand: string; gama: string; tipo: string; line: string; sub: string }[] = [];
  for (const s of sections) {
    const brand = s.brand ?? "Sin marca";
    const gama = (s.gama ?? "").trim();
    const tipo = (s.tipo ?? "").trim();
    const line = (s.line ?? "").trim();
    const sub = (s.subline ?? "").trim();
    for (const e of s.entries) {
      if (isNonFood(e.name, e.unit)) continue;
      flat.push({ e, brand, gama, tipo, line, sub });
    }
  }

  const pushBlock = (label: string, list: typeof flat) => {
    if (list.length === 0) return;
    body.push([{ content: label, colSpan: cols, styles: { fontSize: 11, fontStyle: "bold", fillColor: [17, 24, 39], textColor: [255, 255, 255], cellPadding: 4 } }]);

    const byBrand = new Map<string, typeof flat>();
    for (const it of list) {
      if (!byBrand.has(it.brand)) byBrand.set(it.brand, []);
      byBrand.get(it.brand)!.push(it);
    }

    for (const [brand, prods] of byBrand) {
      const bColor = BRAND_COLORS[brand.toUpperCase()] ?? [30, 41, 59];
      body.push([{ content: brand, colSpan: cols, styles: { fontSize: 11, fontStyle: "bold", fillColor: bColor, textColor: [255, 255, 255], cellPadding: 4 } }]);

      // UNA fila de grupo por GAMA (si hay) o por sección (line|sub) si no.
      const groups = new Map<string, { title: string; items: typeof flat }>();
      for (const it of prods) {
        const gama = gamaBySpecies(it.gama, it.e.name);
        let key: string;
        let title: string;
        if (gama) {
          key = gama;
          title = gama;
        } else {
          key = `${it.brand}\u0000${it.line}\u0000${it.sub}`;
          const isEtapa = /^(CACHORROS?|ADULTOS?|SENIOR)$/i.test(it.line);
          title =
            it.sub && (isEtapa || /^RAZAS/i.test(it.sub))
              ? `${it.sub} - ${it.line}`
              : it.line || it.sub || brand;
        }
        if (!groups.has(key)) groups.set(key, { title, items: [] });
        groups.get(key)!.items.push(it);
      }

      for (const { title, items } of groups.values()) {
        body.push([{ content: title, colSpan: cols, styles: { fontSize: 9.5, fontStyle: "bold", fillColor: [17, 24, 39], textColor: [255, 255, 255], cellPadding: 3.5 } }]);
        for (const it of items) {
          const cat = subCategoryFromName(it.e.name) || it.tipo || it.sub || tallaOf(it.line) || "-";
          body.push([
            abbreviateCategoria(cat),
            displayName(it.e.name, brand),
            it.e.unit ?? "-",
            formatPrice(precioMayorista(it.e.priceSinIva)),
            formatPrice(publico(it.e.priceSinIva)),
          ]);
        }
      }
    }
  };

  pushBlock("ALIMENTO SECO", flat.filter((it) => !esHumedito(it.e.name)));
  pushBlock("ALIMENTO HÚMEDO", flat.filter((it) => esHumedito(it.e.name)));
  return body;
};

/** Genera y descarga el PDF de la planilla mayorista. */
export const exportPlanillaPdf = async (plan: PriceListDetail): Promise<string | null> => {
  const body = buildBody(plan);
  if (body.length === 0) return null;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 30;
  const pageW = doc.internal.pageSize.getWidth();
  let y = 40;

  const logo = await loadLogo(orgLogoUrl);
  if (logo) {
    const logoW = 130;
    const logoH = (logoW * logo.height) / logo.width;
    doc.addImage(logo.dataUrl, "PNG", margin, y, logoW, logoH);
  }
  const rightX = pageW - margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Planilla mayorista", rightX, y + 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${plan.type} · ${plan.sections.length} secciones`, rightX, y + 31, { align: "right" });
  y += 52;

  autoTable(doc, {
    startY: y,
    head: [["Categoría/Talla", "Descripción", "KG", "Precio", "Sugerido"]],
    body: body as never,
    margin: { left: margin, right: margin, top: margin, bottom: 24 },
    styles: { ...ROW_STYLES, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.15 },
    headStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 9, halign: "left" },
    columnStyles: {
      0: { cellWidth: 70 },
      2: { halign: "center", cellWidth: 46 },
      3: { halign: "right", cellWidth: 60 },
      4: { halign: "right", cellWidth: 60 },
    },
    theme: "grid",
  });

  const filename = `planilla_mayorista_${plan.type}_${plan.period ?? "s/f"}.pdf`;
  doc.save(filename);
  return filename;
};
