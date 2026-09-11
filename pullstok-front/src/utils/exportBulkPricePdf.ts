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
  esHumedito,
  displayName,
  isNonFood,
  normalizeLine,
  tallaOf,
  tallaFromName,
  razasOf,
  TALLA_COLORS,
  RAZAS_COLORS,
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
  r: BulkPricePreviewRow;
  brand: string;
  talla: string;
  razas: string;
  humedo: boolean;
}

/** Marca de agrupación: sección de planilla (brand) o brandValues, si no "Sin marca". */
const brandOf = (r: BulkPricePreviewRow): string => {
  const raw =
    r.brand?.trim() ||
    (r.brandValues?.join(", ") || "Sin marca").trim() ||
    "Sin marca";
  return raw === "Sin marca" ? "Sin marca" : raw.toUpperCase();
};

/** Etapa (Cachorros/Adultos/Senior/Gatos): desde la línea de planilla, con
 * respaldo del nombre cuando el producto no tiene sección. */
const tallaOfRow = (r: BulkPricePreviewRow): string => {
  const line = normalizeLine(r.line ?? null);
  if (line) return tallaOf(line);
  return tallaFromName(r.name) ?? "";
};

/** Arma el body igual que la planilla mayorista: SECO/HÚMEDO → marca → etapa →
 * tamaño → productos. Misma jerarquía y mismas bandas de color. */
const buildBody = (rows: BulkPricePreviewRow[]): (string | GroupRow)[][] => {
  const withGroups: RowWithGroups[] = rows
    .filter((r) => !isNonFood(r.name, null))
    .map((r) => ({
      r,
      brand: brandOf(r),
      talla: tallaOfRow(r),
      razas: razasOf(r.name, r.subline ?? null) ?? "",
      humedo: esHumedito(r.name),
    }));

  const body: (string | GroupRow)[][] = [];

  const pushBlock = (label: string, list: RowWithGroups[]) => {
    if (list.length === 0) return;
    body.push([{ content: label, colSpan: 2, styles: { fontSize: 11, fontStyle: "bold", fillColor: [17, 24, 39], textColor: [255, 255, 255], cellPadding: 4 } }]);

    const byBrand = new Map<string, RowWithGroups[]>();
    for (const p of list) {
      if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
      byBrand.get(p.brand)!.push(p);
    }
    for (const [brand, prods] of byBrand) {
      const bColor = BRAND_COLORS[brand] ?? [30, 41, 59];
      body.push([{ content: brand, colSpan: 2, styles: { fontSize: 10.5, fontStyle: "bold", fillColor: bColor, textColor: [255, 255, 255], cellPadding: 4 } }]);
      const byTalla = new Map<string, RowWithGroups[]>();
      for (const p of prods) {
        const k = p.talla || brand;
        if (!byTalla.has(k)) byTalla.set(k, []);
        byTalla.get(k)!.push(p);
      }
      for (const [talla, tp] of byTalla) {
        const tColor = TALLA_COLORS[talla] ?? [30, 41, 59];
        body.push([{ content: talla, colSpan: 2, styles: { fontSize: 9.5, fontStyle: "bold", fillColor: tColor, textColor: [255, 255, 255], cellPadding: 3.5 } }]);
        const byRazas = new Map<string, RowWithGroups[]>();
        for (const p of tp) {
          const k = p.razas;
          if (!byRazas.has(k)) byRazas.set(k, []);
          byRazas.get(k)!.push(p);
        }
        for (const [razas, rp] of byRazas) {
          if (razas) {
            const rColor = RAZAS_COLORS[razas] ?? [100, 116, 139];
            body.push([{ content: razas, colSpan: 2, styles: { fontSize: 8.5, fontStyle: "bold", fillColor: rColor, textColor: [255, 255, 255], cellPadding: 3 } }]);
          }
          for (const p of rp) {
            body.push([
              displayName(p.r.name, p.brand),
              formatPrice(p.r.newPrice),
            ] as unknown as GroupRow[]);
          }
        }
      }
    }
  };

  pushBlock("ALIMENTO SECO", withGroups.filter((p) => !p.humedo));
  pushBlock("ALIMENTO HÚMEDO", withGroups.filter((p) => p.humedo));
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
    head: [["Producto", "Precio"]],
    body: body as never,
    margin: { left: margin, right: margin, top: margin, bottom: 24 },
    styles: { ...ROW_STYLES, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.15 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 9, halign: "left" },
    columnStyles: {
      1: { halign: "right", cellWidth: 70 },
    },
    theme: "grid",
  });

  const filename = `actualizacion_precios_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
};
