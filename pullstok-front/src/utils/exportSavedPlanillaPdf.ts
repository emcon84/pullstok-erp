/**
 * Generación del PDF de una planilla GUARDADA (saved planilla) con jsPDF +
 * autoTable (texto real, buscable). Un solo formato genérico que reconstruye
 * tanto la planilla mayorista (prices.length === 2) como la vista previa de
 * actualización de precios (prices.length === 1), porque cada fila guardada
 * lleva su snapshot de `prices` ya resuelto.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { SavedPlanillaRow, SavedPlanillaType } from "@/services/savedPlanillas";
import orgLogoUrl from "@/assets/logo-horizontal-almacen.png";
import { GroupRow } from "./exportPlanillaPdf";
import {
  formatPrice,
  displayName,
  isNonFood,
  tallaFromName,
  abbreviateCategoria,
  subCategoryFromName,
  gamaBySpecies,
  BRAND_COLORS,
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
  r: SavedPlanillaRow;
  brand: string;
  group: string;
  cat: string;
}

/** Marca de agrupación de una fila guardada. "Sin marca" si no hay brand. */
const brandOf = (r: SavedPlanillaRow): string => {
  const raw = r.brand?.trim() || "Sin marca";
  return raw === "Sin marca" ? "Sin marca" : raw.toUpperCase();
};

/** Categoría/Talla de una fila guardada: sub-categoría del nombre, o `tipo`
 * del snapshot, o talla del nombre. */
const categoriaOf = (r: SavedPlanillaRow): string =>
  subCategoryFromName(r.name) || (r.tipo ?? "").trim() || tallaFromName(r.name) || "-";

/**
 * Arma el body estilo planilla (formato Excel): marca → fila de grupo por
 * `gama` (fallback `gama || tipo || brand`) → Categoría/Talla | Producto | …
 * El número de columnas depende de cuántos precios tiene cada fila guardada.
 */
const buildBody = (rows: SavedPlanillaRow[], pricesLen: number): (string | GroupRow)[][] => {
  const cols = pricesLen === 2 ? 5 : 3;
  const withGroups: RowWithGroups[] = rows
    .filter((r) => !isNonFood(r.name, r.unit))
    .map((r) => {
      const gama = (r.gama ?? "").trim();
      const tipo = (r.tipo ?? "").trim();
      const brand = brandOf(r);
      const group = gamaBySpecies(gama, r.name) || tipo || brand;
      return { r, brand, group, cat: categoriaOf(r) };
    });

  const body: (string | GroupRow)[][] = [];

  const byBrand = new Map<string, RowWithGroups[]>();
  for (const p of withGroups) {
    if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
    byBrand.get(p.brand)!.push(p);
  }
  for (const [brand, prods] of byBrand) {
    const bColor = BRAND_COLORS[brand] ?? [30, 41, 59];
    body.push([{ content: brand, colSpan: cols, styles: { fontSize: 11, fontStyle: "bold", fillColor: bColor, textColor: [255, 255, 255], cellPadding: 4 } }]);
    const byGroup = new Map<string, RowWithGroups[]>();
    for (const p of prods) {
      if (!byGroup.has(p.group)) byGroup.set(p.group, []);
      byGroup.get(p.group)!.push(p);
    }
    for (const [group, items] of byGroup) {
      body.push([{ content: group, colSpan: cols, styles: { fontSize: 9.5, fontStyle: "bold", fillColor: [17, 24, 39], textColor: [255, 255, 255], cellPadding: 3.5 } }]);
      // Dentro de cada gama, agrupar por Categoría/Talla para que los tipos
      // salgan juntos y ordenados (no intercalados).
      const byCat = new Map<string, RowWithGroups[]>();
      for (const p of items) {
        if (!byCat.has(p.cat)) byCat.set(p.cat, []);
        byCat.get(p.cat)!.push(p);
      }
      for (const [cat, catItems] of byCat) {
        for (const p of catItems) {
          if (pricesLen === 2) {
            body.push([
              abbreviateCategoria(cat),
              displayName(p.r.name, p.brand),
              p.r.unit ?? "-",
              formatPrice(p.r.prices[0]),
              formatPrice(p.r.prices[1]),
            ]);
          } else {
            body.push([
              abbreviateCategoria(cat),
              displayName(p.r.name, p.brand),
              formatPrice(p.r.prices[0]),
            ]);
          }
        }
      }
    }
  }
  return body;
};

/** Genera y descarga el PDF de una planilla guardada. */
export const exportSavedPlanillaPdf = async (planilla: {
  type: SavedPlanillaType;
  title: string;
  rows: SavedPlanillaRow[];
}): Promise<string | null> => {
  const pricesLen = planilla.rows[0]?.prices.length ?? 0;
  const body = buildBody(planilla.rows, pricesLen);
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
  doc.text(planilla.type === "MAYORISTA" ? "Planilla mayorista" : "Actualización de precios", rightX, y + 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(planilla.title, rightX, y + 31, { align: "right" });
  y += 52;

  const head =
    pricesLen === 2
      ? ["Categoría/Talla", "Descripción", "KG", "Precio", "Sugerido"]
      : ["Categoría/Talla", "Producto", "Precio"];

  autoTable(doc, {
    startY: y,
    head: [head],
    body: body as never,
    margin: { left: margin, right: margin, top: margin, bottom: 24 },
    styles: { ...ROW_STYLES, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.15 },
    headStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 9, halign: "left" },
    columnStyles:
      pricesLen === 2
        ? {
            0: { cellWidth: 70 },
            2: { halign: "center", cellWidth: 46 },
            3: { halign: "right", cellWidth: 60 },
            4: { halign: "right", cellWidth: 60 },
          }
        : {
            0: { cellWidth: 70 },
            2: { halign: "right", cellWidth: 70 },
          },
    theme: "grid",
  });

  const filename = `planilla_${planilla.type.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
};
