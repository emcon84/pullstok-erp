/**
 * Import de planillas de precios Alican (sdd/alican-wholesale-price-list).
 *
 * importPriceList (preview): multer → pdf-parse getText → detectLayout →
 * parseAlicanSeco|Wet → capturePeriod → buildCatalogIndex(org) → matchRows →
 * fs.unlink del temporal (D5) → 200 con rows + estados + sugerido. Con
 * ?dryRun=false aplica decisiones DEFAULT (D10: matched/multi-match[0] se
 * importan; el resto se omite).
 *
 * applyPriceList: transacción idempotente (D1/D2) — findFirst PriceList
 * (org, type, period) → deleteMany (recrear) → create PriceList + sections
 * (jerarquía del PDF) + entries → updateMany Product.suggestedPrice UNA vez
 * por producto. product.price NUNCA se toca (invariante). Fila omitida: no se
 * persiste ni toca nada.
 */

import fs from "fs";
import { Request, Response } from "express";
import { PDFParse } from "pdf-parse";
import { requireOrganizationId } from "../config/tenantContext";
import { prisma } from "../config/db";
import {
  buildCatalogIndex,
  computeSuggestedPrice,
  detectLayout,
  LayoutNotSupportedError,
  matchRows,
  normalizeName,
  parseAlicanSeco,
  parseAlicanWet,
  type Layout,
  type PreviewRow,
} from "../services/providerPriceListService";

/** Error de negocio del apply → 400 con mensaje al usuario. */
export class ApplyPriceListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyPriceListError";
  }
}

export interface ApplyDecision {
  position: number;
  accion: "import" | "omit";
  productId?: string;
  nombre: string;
  marca?: string | null;
  linea?: string | null;
  sublinea?: string | null;
  unidadEmpaque?: string | null;
  precioSinIva?: number | null;
  precioConIva?: number | null;
}

interface SectionGroup {
  brand: string | null;
  line: string | null;
  subline: string | null;
  entries: ApplyDecision[];
}

/**
 * Agrupa las filas a importar por jerarquía DEL PDF (marca → línea → sublínea)
 * en orden de aparición: cada grupo es una PriceListSection. Sin jerarquía
 * (WET, D9) → una sola sección plana.
 */
export function buildSections(rows: ApplyDecision[]): SectionGroup[] {
  const sections: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  let currentKey = "";
  for (const r of rows) {
    const key = `${r.marca ?? ""}\u0000${r.linea ?? ""}\u0000${r.sublinea ?? ""}`;
    if (!current || key !== currentKey) {
      current = {
        brand: r.marca ?? null,
        line: r.linea ?? null,
        subline: r.sublinea ?? null,
        entries: [],
      };
      sections.push(current);
      currentKey = key;
    }
    current.entries.push(r);
  }
  return sections;
}

/** Decisiones default para ?dryRun=false (D10). */
function defaultDecisions(preview: PreviewRow[]): ApplyDecision[] {
  return preview.map((r) => ({
    position: r.position,
    accion:
      r.estado === "matched" || r.estado === "multi-match" ? "import" : "omit",
    productId: r.productId ?? undefined,
    nombre: r.nombre,
    marca: r.marca,
    linea: r.linea,
    sublinea: r.sublinea,
    unidadEmpaque: r.unidadEmpaque,
    precioSinIva: r.precioSinIva,
    precioConIva: r.precioConIva,
  }));
}

async function extractPdfText(filePath: string): Promise<string> {
  const buf = await fs.promises.readFile(filePath);
  const parser = new PDFParse({ data: buf });
  const res = await parser.getText();
  return res.text;
}

/** Preview con el catálogo de la org (puro de DB: recibe el cliente db). */
export async function buildPreview(
  db: { product: { findMany: (args: any) => Promise<any[]> } },
  organizationId: string,
  text: string,
): Promise<{ layout: Layout; period: string | null; rows: PreviewRow[] }> {
  const layout = detectLayout(text);
  const { period, rows } =
    layout === "SECO" ? parseAlicanSeco(text) : parseAlicanWet(text);
  const index = await buildCatalogIndex(db, organizationId);
  return { layout, period, rows: matchRows(rows, index) };
}

export const importPriceList = async (req: Request, res: Response) => {
  let filePath: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se recibió el archivo" });
    }
    filePath = req.file.path;
    const organizationId = requireOrganizationId();

    const text = await extractPdfText(filePath);
    const { layout, period, rows } = await buildPreview(prisma, organizationId, text);

    // D5: el PDF temporal se borra apenas se parsea; sourceFilename conserva
    // el nombre original como metadata.
    await fs.promises.unlink(filePath).catch(() => undefined);
    filePath = null;

    const sourceFilename = req.file.originalname;
    const dryRun = req.query.dryRun !== "false"; // default true

    if (dryRun) {
      return res.status(200).json({
        layout,
        period,
        sourceFilename,
        total: rows.length,
        rows,
      });
    }

    // D10: apply con decisiones default (matched + multi-match[0] importados;
    // unmatched / duplicado-extra / error omitidos).
    const result = await applyPriceListCore(organizationId, {
      layout,
      period,
      sourceFilename,
      rows: defaultDecisions(rows),
    });
    return res.status(200).json(result);
  } catch (error: any) {
    if (filePath) {
      await fs.promises.unlink(filePath).catch(() => undefined);
    }
    if (error instanceof LayoutNotSupportedError) {
      return res.status(400).json({ message: "Formato de planilla no reconocido" });
    }
    console.error("Error importando planilla:", error);
    return res.status(500).json({ message: "Error al procesar la planilla" });
  }
};

export const applyPriceList = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const body = req.body as {
      layout: Layout;
      period: string | null;
      sourceFilename: string;
      rows: ApplyDecision[];
    };
    const result = await applyPriceListCore(organizationId, body);
    return res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ApplyPriceListError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error aplicando planilla:", error);
    return res.status(500).json({ message: "Error al aplicar la planilla" });
  }
};

/** Núcleo transaccional del apply (compartido por /apply y ?dryRun=false). */
async function applyPriceListCore(
  organizationId: string,
  body: {
    layout: Layout;
    period: string | null;
    sourceFilename: string;
    rows: ApplyDecision[];
  },
): Promise<{ priceListId: string; imported: number; omitted: number; suggestedUpdated: number }> {
  const { layout, period, sourceFilename, rows } = body;
  const imports = rows.filter((r) => r.accion === "import");

  if (imports.length === 0) {
    throw new ApplyPriceListError("No hay filas para importar");
  }
  for (const r of imports) {
    if (r.precioSinIva == null && r.precioConIva == null) {
      throw new ApplyPriceListError(`La fila "${r.nombre}" no tiene precios para importar`);
    }
    if (!r.productId) {
      throw new ApplyPriceListError(
        `La fila "${r.nombre}" necesita un producto asignado para importarse`,
      );
    }
  }
  // A lo sumo UNA fila importada por grupo duplicado del PDF (mismo nombre normalizado).
  const groupCounts = new Map<string, number>();
  for (const r of imports) {
    const key = normalizeName(r.nombre);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of groupCounts) {
    if (count > 1) {
      throw new ApplyPriceListError(
        `Hay más de una fila importada con el mismo nombre: "${key}"`,
      );
    }
  }

  const type = layout === "SECO" ? "SECO" : "WET";

  return prisma.$transaction(async (tx) => {
    // Anti-fuga (REQ-12): los productId deben existir en la org. El cliente tx
    // hereda la extensión tenant → el findMany ya scopea por organizationId.
    const productIds = [...new Set(imports.map((r) => r.productId!).filter(Boolean))];
    if (productIds.length > 0) {
      const found = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (found.length !== productIds.length) {
        throw new ApplyPriceListError("Producto manual fuera de la organización");
      }
    }

    // Idempotencia (D1/D2): mismo (org, type, period) → borra y recrea.
    const existing = await tx.priceList.findFirst({
      where: { organizationId, type, period: period ?? null },
    });
    if (existing) {
      await tx.priceList.deleteMany({ where: { id: existing.id } });
    }

    const created = await tx.priceList.create({
      data: {
        organizationId,
        provider: "ALICAN",
        type,
        period: period ?? null,
        sourceFilename,
      },
    });

    const sections = buildSections(imports);
    let sectionPosition = 0;
    for (const section of sections) {
      const sec = await tx.priceListSection.create({
        data: {
          priceListId: created.id,
          brand: section.brand,
          line: section.line,
          subline: section.subline,
          position: sectionPosition++,
        },
      });
      let entryPosition = 0;
      for (const r of section.entries) {
        const sugerido = computeSuggestedPrice(r.precioConIva ?? null, r.precioSinIva ?? null);
        await tx.priceListEntry.create({
          data: {
            sectionId: sec.id,
            productId: r.productId!,
            name: r.nombre,
            unit: r.unidadEmpaque ?? null,
            priceSinIva: r.precioSinIva ?? null,
            priceConIva: r.precioConIva ?? null,
            suggestedPrice: sugerido,
            matched: true,
            position: entryPosition++,
          },
        });
      }
    }

    // suggestedPrice: UNA escritura por producto (aunque haya N filas con el
    // mismo producto) — NUNCA toca product.price (invariante).
    const seenProducts = new Set<string>();
    for (const r of imports) {
      if (!r.productId || seenProducts.has(r.productId)) continue;
      seenProducts.add(r.productId);
      const sugerido = computeSuggestedPrice(r.precioConIva ?? null, r.precioSinIva ?? null);
      await tx.product.updateMany({
        where: { id: r.productId },
        data: { suggestedPrice: sugerido },
      });
    }

    return {
      priceListId: created.id,
      imported: imports.length,
      omitted: rows.length - imports.length,
      suggestedUpdated: seenProducts.size,
    };
  });
}

const providerPriceListController = { importPriceList, applyPriceList };
export default providerPriceListController;
