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
  speciesOf,
  gamaOf,
  razasOf,
  SPECIES_COLORS,
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
  species: string;
  gama: string;
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

/** Arma el body: SECO/HÚMEDO → marca → ESPECIE (perro/gato/medicado, nunca se
 * mezclan) → gama → tamaño → productos. Bandas de color, texto real. */
const buildBody = (rows: BulkPricePreviewRow[]): (string | GroupRow)[][] => {
  const withGroups: RowWithGroups[] = rows
    .filter((r) => !isNonFood(r.name, null))
    .map((r) => ({
      r,
      brand: brandOf(r),
      species: speciesOf(r.name, r.line, r.subline, r.categoryName),
      gama: gamaOf(r.name, r.line),
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
      const bySpecies = new Map<string, RowWithGroups[]>();
      for (const p of prods) {
        if (!bySpecies.has(p.species)) bySpecies.set(p.species, []);
        bySpecies.get(p.species)!.push(p);
      }
      for (const [species, sp] of bySpecies) {
        const spColor = SPECIES_COLORS[species] ?? [100, 116, 139];
        body.push([{ content: species, colSpan: 2, styles: { fontSize: 9.5, fontStyle: "bold", fillColor: spColor, textColor: [255, 255, 255], cellPadding: 3.5 } }]);
        const byGama = new Map<string, RowWithGroups[]>();
        for (const p of sp) {
          const k = p.gama || species;
          if (!byGama.has(k)) byGama.set(k, []);
          byGama.get(k)!.push(p);
        }
        for (const [gama, gp] of byGama) {
          const gColor = TALLA_COLORS[gama] ?? [30, 41, 59];
          body.push([{ content: gama, colSpan: 2, styles: { fontSize: 8.5, fontStyle: "bold", fillColor: gColor, textColor: [255, 255, 255], cellPadding: 3 } }]);
          const byRazas = new Map<string, RowWithGroups[]>();
          for (const p of gp) {
            const k = p.razas;
            if (!byRazas.has(k)) byRazas.set(k, []);
            byRazas.get(k)!.push(p);
          }
          for (const [razas, rp] of byRazas) {
            if (razas) {
              const rColor = RAZAS_COLORS[razas] ?? [100, 116, 139];
              body.push([{ content: razas, colSpan: 2, styles: { fontSize: 8, fontStyle: "bold", fillColor: rColor, textColor: [255, 255, 255], cellPadding: 2.8 } }]);
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
