/**
 * Generación del PDF del listado de la actualización masiva (vista previa) con
 * jsPDF + autoTable, con EL MISMO diseño que la planilla mayorista:
 * SECO/HÚMEDO → marca → talla → razas, bandas de color, texto real (buscable).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BulkPricePreviewRow } from "@/services/productService";
import orgLogoUrl from "@/assets/logo-horizontal-almacen.png";
import { GroupRow } from "./exportPlanillaPdf";
import {
  formatPrice,
  displayName,
  isNonFood,
  esHumedito,
  normalizeLine,
  tallaOf,
  tallaFromName,
  abbreviateCategoria,
  subCategoryFromName,
  weightKgOf,
  gamaBySpecies,
  BRAND_COLORS,
  brandOrder,
} from "./planillaGroups";

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

interface RowWithGroups {
  r: BulkPricePreviewRow;
  brand: string;
  sub: string;
  group: string;
  cat: string;
}

/** Marca de agrupación: sección de planilla (brand) o brandValues, si no "Sin marca". */
const brandOf = (r: BulkPricePreviewRow): string => {
  const raw =
    r.brand?.trim() ||
    (r.brandValues?.join(", ") || "Sin marca").trim() ||
    "Sin marca";
  return raw === "Sin marca" ? "Sin marca" : raw.toUpperCase();
};

/** Arma el body estilo planilla (formato Excel): marca → fila de grupo por
 * sección → Categoría/Talla | Producto | Precio. Precios intactos. */
const buildBody = (rows: BulkPricePreviewRow[]): (string | GroupRow)[][] => {
  const withGroups: RowWithGroups[] = rows
    .filter((r) => !isNonFood(r.name, null))
    .map((r) => {
      const gama = (r.gama ?? "").trim();
      const tipo = (r.tipo ?? "").trim();
      const sub = (r.subline ?? "").trim();
      const line = normalizeLine(r.line ?? null) ?? "";
      const isEtapa = /^(CACHORROS?|ADULTOS?|SENIOR)$/i.test(line);
      const group =
        gamaBySpecies(gama, r.name) ||
        (sub && (isEtapa || /^RAZAS/i.test(sub))
          ? `${sub} - ${line}`
          : line || sub || brandOf(r));
      return {
        r,
        brand: brandOf(r),
        sub,
        group,
        cat: subCategoryFromName(r.name) || tipo || sub || tallaOf(line) || tallaFromName(r.name) || "-",
      };
    });

  const body: (string | GroupRow)[][] = [];
  const cols = 3;

  const pushBrandSubBlock = (label: string, list: RowWithGroups[]) => {
    if (list.length === 0) return;
    body.push([{ content: label, colSpan: cols, styles: { fontSize: 11, fontStyle: "bold", fillColor: [17, 24, 39], textColor: [255, 255, 255], cellPadding: 4 } }]);
    const byGroup = new Map<string, RowWithGroups[]>();
    for (const p of list) {
      if (!byGroup.has(p.group)) byGroup.set(p.group, []);
      byGroup.get(p.group)!.push(p);
    }
    for (const [group, items] of byGroup) {
      body.push([{ content: group, colSpan: cols, styles: { fontSize: 9.5, fontStyle: "bold", fillColor: [17, 24, 39], textColor: [255, 255, 255], cellPadding: 3.5 } }]);
      const byCat = new Map<string, RowWithGroups[]>();
      for (const p of items) {
        if (!byCat.has(p.cat)) byCat.set(p.cat, []);
        byCat.get(p.cat)!.push(p);
      }
      for (const cat of [...byCat.keys()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))) {
        const catItems = byCat.get(cat)!;
        const sorted = [...catItems].sort(
          (a, b) => weightKgOf(a.r.name) - weightKgOf(b.r.name) || a.r.name.localeCompare(b.r.name),
        );
        for (const p of sorted) {
          body.push([
            abbreviateCategoria(cat),
            displayName(p.r.name, p.brand),
            formatPrice(p.r.newPrice),
          ]);
        }
      }
    }
  };

  // Marca primero (ROYAL CANIN, resto, EUKANUBA), y dentro de cada marca los
  // sub-bloques SECO y HÚMEDO (solo si hay items de ese tipo).
  const byBrand = new Map<string, RowWithGroups[]>();
  for (const p of withGroups) {
    if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
    byBrand.get(p.brand)!.push(p);
  }
  for (const brand of [...byBrand.keys()].sort(
    (a, b) => brandOrder(a) - brandOrder(b) || a.localeCompare(b, "es", { sensitivity: "base" }),
  )) {
    const prods = byBrand.get(brand)!;
    const bColor = BRAND_COLORS[brand] ?? [30, 41, 59];
    body.push([{ content: brand, colSpan: cols, styles: { fontSize: 11, fontStyle: "bold", fillColor: bColor, textColor: [255, 255, 255], cellPadding: 4 } }]);
    pushBrandSubBlock("ALIMENTO SECO", prods.filter((p) => !esHumedito(p.r.name)));
    pushBrandSubBlock("ALIMENTO HÚMEDO", prods.filter((p) => esHumedito(p.r.name)));
  }
  return body;
};

/** Genera y descarga el PDF del listado de precios actualizados. */
export const exportBulkPricePdf = async (
  rows: BulkPricePreviewRow[],
): Promise<string | null> => {
  const body = buildBody(rows);
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
  doc.text("Precios", rightX, y + 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString("es-AR"), rightX, y + 31, { align: "right" });
  y += 52;

  autoTable(doc, {
    startY: y,
    head: [["Categoría/Talla", "Producto", "Precio"]],
    body: body as never,
    margin: { left: margin, right: margin, top: margin, bottom: 24 },
    styles: { ...ROW_STYLES, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.15 },
    headStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 9, halign: "left" },
    columnStyles: {
      0: { cellWidth: 70 },
      2: { halign: "right", cellWidth: 70 },
    },
    theme: "grid",
  });

  const filename = `actualizacion_precios_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
};
