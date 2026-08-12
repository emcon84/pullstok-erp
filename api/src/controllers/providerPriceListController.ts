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
import { InvalidPDFException, PDFParse } from "pdf-parse";
import { runWithTenant, requireOrganizationId } from "../config/tenantContext";
import type { AuthedRequest } from "../middlewares/authMiddleware";
import { prisma } from "../config/db";
import { round2 } from "../utils/money";
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
  // Fix round 2 (verify obs #213 finding C): multer (busboy) puede PERDER el
  // contexto ALS de authenticateJWT durante el parseo multipart — los
  // callbacks del stream del request corren fuera del scope de runWithTenant
  // (fallo INTERMITENTE, race entre completar el archivo y el 'end' del
  // request). req.user se setea ANTES de multer, así que re-establecemos el
  // contexto de tenant desde ahí para que requireOrganizationId() y la
  // extensión anti-fuga de Prisma funcionen aunque el ALS se haya perdido.
  const user = (req as AuthedRequest).user;
  if (user?.organizationId) {
    return runWithTenant(
      { userId: user.id, role: user.role, organizationId: user.organizationId },
      () => importPriceListCore(req, res),
    );
  }
  return importPriceListCore(req, res);
};

/** Cuerpo del preview (envuelto en el contexto restaurado por importPriceList). */
async function importPriceListCore(req: Request, res: Response) {
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
    // Archivo no-PDF / PDF corrupto: pdf-parse lanza InvalidPDFException (y
    // FormatError/PasswordException en variantes). Mismo semántica 400 que el
    // layout no reconocido (spec REQ-1 "fallo explícito, nunca silencioso").
    const isPdfParseError =
      error instanceof InvalidPDFException ||
      (typeof error?.name === "string" &&
        /^(InvalidPDFException|FormatError|PasswordException)$/.test(error.name));
    if (isPdfParseError) {
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

// ── Listado / detalle (REQ-9) ──────────────────────────────────────────────

/**
 * GET /price-lists — planillas de la org por importedAt desc, con
 * sectionsCount y entriesCount agregados.
 */
export const listPriceLists = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const lists = await prisma.priceList.findMany({
      where: { organizationId },
      orderBy: { importedAt: "desc" },
      select: {
        id: true,
        provider: true,
        type: true,
        period: true,
        sourceFilename: true,
        importedAt: true,
        _count: { select: { sections: true } },
        sections: { select: { _count: { select: { entries: true } } } },
      },
    });
    const items = lists.map((l) => ({
      id: l.id,
      provider: l.provider,
      type: l.type,
      period: l.period,
      sourceFilename: l.sourceFilename,
      importedAt: l.importedAt,
      sectionsCount: l._count.sections,
      entriesCount: l.sections.reduce((s, sec) => s + sec._count.entries, 0),
    }));
    return res.status(200).json({ items });
  } catch (error: any) {
    console.error("Error listando planillas:", error);
    return res.status(500).json({ message: "Error al listar las planillas" });
  }
};

/**
 * GET /price-lists/:id — jerarquía del PDF (sections por position, entries por
 * position). 404 si la planilla no existe o pertenece a otra org (findFirst
 * con organizationId — anti-fuga REQ-12).
 */
export const getPriceList = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { id } = req.params;
    const pl = await prisma.priceList.findFirst({
      where: { id, organizationId },
      include: {
        sections: {
          orderBy: { position: "asc" },
          include: { entries: { orderBy: { position: "asc" } } },
        },
      },
    });
    if (!pl) {
      return res.status(404).json({ message: "Planilla no encontrada" });
    }
    return res.status(200).json({
      id: pl.id,
      provider: pl.provider,
      type: pl.type,
      period: pl.period,
      sourceFilename: pl.sourceFilename,
      importedAt: pl.importedAt,
      sections: pl.sections.map((s) => ({
        id: s.id,
        brand: s.brand,
        line: s.line,
        subline: s.subline,
        position: s.position,
        entries: s.entries.map((e) => ({
          id: e.id,
          productId: e.productId,
          name: e.name,
          unit: e.unit,
          // Prisma Decimal se serializaría a STRING en JSON; el contrato
          // (design §6.3) y los tipos del front exigen number. Convertir acá.
          priceSinIva: e.priceSinIva === null ? null : Number(e.priceSinIva),
          priceConIva: e.priceConIva === null ? null : Number(e.priceConIva),
          suggestedPrice: e.suggestedPrice === null ? null : Number(e.suggestedPrice),
          matched: e.matched,
          position: e.position,
        })),
      })),
    });
  } catch (error: any) {
    console.error("Error obteniendo planilla:", error);
    return res.status(500).json({ message: "Error al obtener la planilla" });
  }
};

// ── Ajuste masivo de sugeridos (REQ-11, D7) ────────────────────────────────

interface AdjustRow {
  entryId: string;
  name: string;
  productId: string | null;
  suggestedPrice: number;
  newSuggestedPrice: number;
  delta: number;
}

/**
 * POST /price-lists/:id/adjust (?dryRun) — patrón dryRun de bulkPriceUpdate:
 * el % se aplica server-side sobre el suggestedPrice ACTUAL de cada entrada de
 * la planilla (excluidas fuera; overrides por entryId). El apply escribe
 * PriceListEntry.suggestedPrice Y Product.suggestedPrice (solo entradas con
 * productId). Los precios del proveedor (priceSinIva/priceConIva) NO se tocan.
 * Comportamiento compuesto en re-runs (10% + 10% ≠ 21%), igual que bulkPriceUpdate.
 */
export const adjustPriceList = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { id } = req.params;
    const { percentage, excludeEntryIds = [], entryOverrides = [] } = req.body as {
      percentage?: number;
      excludeEntryIds?: string[];
      entryOverrides?: { entryId: string; suggestedPrice: number }[];
    };
    const dryRun = req.query.dryRun === "true";

    const pl = await prisma.priceList.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!pl) {
      return res.status(404).json({ message: "Planilla no encontrada" });
    }

    const entries = await prisma.priceListEntry.findMany({
      where: { section: { priceListId: id } },
      select: { id: true, productId: true, name: true, suggestedPrice: true },
    });

    const excluded = new Set(excludeEntryIds);
    const overrideByEntry = new Map(
      entryOverrides.map((o) => [o.entryId, o.suggestedPrice]),
    );
    const pct = percentage ?? 0;

    const rows: AdjustRow[] = entries
      .filter((e) => !excluded.has(e.id))
      .map((e) => {
        const current = Number(e.suggestedPrice ?? 0);
        const next = overrideByEntry.has(e.id)
          ? round2(overrideByEntry.get(e.id)!)
          : round2(current * (1 + pct / 100));
        return {
          entryId: e.id,
          name: e.name,
          productId: e.productId,
          suggestedPrice: current,
          newSuggestedPrice: next,
          delta: round2(next - current),
        };
      });

    const affected = rows.length;
    const previousTotal = round2(rows.reduce((s, r) => s + r.suggestedPrice, 0));
    const newTotal = round2(rows.reduce((s, r) => s + r.newSuggestedPrice, 0));

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        for (const r of rows) {
          await tx.priceListEntry.updateMany({
            where: { id: r.entryId },
            data: { suggestedPrice: r.newSuggestedPrice },
          });
          if (r.productId) {
            await tx.product.updateMany({
              where: { id: r.productId },
              data: { suggestedPrice: r.newSuggestedPrice },
            });
          }
        }
      });
      return res.status(200).json({ affected, previousTotal, newTotal });
    }

    return res.status(200).json({ affected, previousTotal, newTotal, rows });
  } catch (error: any) {
    console.error("Error ajustando planilla:", error);
    return res.status(500).json({ message: "Error al ajustar la planilla" });
  }
};

const priceListController = {
  importPriceList,
  applyPriceList,
  listPriceLists,
  getPriceList,
  adjustPriceList,
};
export default priceListController;
