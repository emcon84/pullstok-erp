/**
 * Load products from distributor PDF price lists into an organization.
 *
 * Sources (all parsed with pdf-parse):
 *   1. Vitalcan — "SUGERIDO PUBLICO VITALCAN ACTUAL.pdf"
 *      Row:   COD  DESCRIPTION...  VET_PRICE  $  PUBLIC_PRICE  $
 *   2. Old Prince / OMD — "Lista Veterinarias - 06-07-2026-solo-oldprince.pdf"
 *      Row:   ID  LINE  DESCRIPTION  KG  PROT  VET_PRICE  $  PUBLIC_PRICE  $
 *      (some non-food sections use a single price column)
 *   3. Eukanuba + Royal Canin — "Lista de Precios Eukanuba y Royal Canin Julio 2026.pdf"
 *      Row:   CODE  DESCRIPTION  KG  PRICE_NO_IVA  $  PUBLIC_PRICE  $
 *      (RC rows may inherit the previous row description)
 *
 * Matching against the existing category tree; missing categories are created
 * following the established conceptual structure (root > species > subcategory).
 * Products are upserted by their real distributor code.
 *
 * Usage:
 *   DRY RUN (no DB writes):  npx tsx scripts/load-distributor-pdfs.ts --dry-run
 *   FULL LOAD:               npx tsx scripts/load-distributor-pdfs.ts
 */

import "dotenv/config";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { basePrisma } from "../src/config/db";

const ORG_SLUG = "el-almacen-de-las-mascotas";

const PDFS = {
  vitalcan: process.env.VITALCAN_PDF || "./pdfs/SUGERIDO PUBLICO VITALCAN ACTUAL.pdf",
  oldprince: process.env.OLDPRINCE_PDF || "./pdfs/Lista Veterinarias - 06-07-2026-solo-oldprince.pdf",
  eukanuba: process.env.EUKANUBA_PDF || "./pdfs/Lista de Precios Eukanuba y Royal Canin Julio 2026.pdf",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawProduct {
  source: keyof typeof PDFS;
  code: string;
  description: string; // full real description from the PDF
  price: number; // public price
  hintSpecies?: "perros" | "gatos" | null; // from section headers when description is ambiguous
}

interface Classified {
  kind: "seco" | "humedo" | "prescripcion" | "snack" | "otro";
  species: "perros" | "gatos" | "aves" | "roedores" | null;
  categoryPath: string[]; // root > child > grandchild (full names)
  brand: string;
  etapa: string | null;
  segmento: string | null;
  tamaño: string | null;
  sabor: string | null;
  formato: string | null;
}

// ---------------------------------------------------------------------------
// PDF parsing
// ---------------------------------------------------------------------------

async function readPdfText(path: string): Promise<string> {
  const buf = fs.readFileSync(path);
  const parser = new PDFParse({ data: buf });
  await parser.load();
  const res = await parser.getText();
  return res.pages.map((p) => p.text).join("\n");
}

function parsePrice(raw: string): number {
  // "34,148.18" (US: miles=comma, decimal=dot) -> 34148.18
  // "1.658,00" (AR: miles=dot, decimal=comma)  -> 1658.00
  const s = raw.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // AR: comma is the decimal separator -> strip dots, comma -> dot
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: dot is the decimal separator -> strip commas, keep dot
      normalized = s.replace(/,/g, "");
    }
  } else if (lastComma > -1 && lastDot === -1) {
    normalized = s.replace(",", ".");
  } else {
    normalized = s;
  }
  return Math.round(parseFloat(normalized) * 100) / 100;
}

function parseVitalcan(text: string): RawProduct[] {
  const out: RawProduct[] = [];
  // Anchored to line start; description ends at the trailing classification
  // tokens ("BALANCED NR ESPEC VITAL", "WET MASIVO VITAL", ...).
  const re = /^(\d{6,8})\s+(.+?)\s+([\d.,]+)\t\$\s+([\d.,]+)\t\$/gm;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A line starting with a code but lacking prices may be split: its price
    // row is on the next line (e.g. "2421749 ... BALANCED NR ESPEC\nVITAL 26,267.83 $ 34,148.18 $").
    if (!line.includes("\t$") && /^\d{6,8}\s/.test(line) && lines[i + 1]?.includes("\t$")) {
      lines[i] = line + " " + lines[i + 1];
      lines.splice(i + 1, 1);
    }
  }
  const joined = lines.join("\n");
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) {
    let description = m[2].replace(/\s+/g, " ").trim();
    // Strip Vitalcan classification suffix: repeated brand + tokens like
    // NR ESPEC / ESPEC / WET MASIVO / MASIVO / VITAL at the end.
    const suffixRe = /\s+(?:BALANCED|NR|ESPEC|MASIVO|WET|SOBRE|EN\s+SOBRE|LATA|VITAL|ACTUAL)$/i;
    let stripped = true;
    while (stripped) {
      const before = description;
      description = description.replace(suffixRe, "");
      stripped = description !== before;
    }
    out.push({
      source: "vitalcan",
      code: m[1],
      description: description.toUpperCase(),
      price: parsePrice(m[4]),
    });
  }
  return out;
}

// Rows with a single price column (ZOOTEC / mordedores / premios sections)
const OLDPRINCE_SINGLE_PRICE = /PRECIO A|PRECIO\s*$/;

// Known section names as they appear in header lines ("ID <SECTION> ...")
const OLDPRINCE_SECTIONS: Array<{ re: RegExp; name: string }> = [
  { re: /^ID\s+OLD PRINCE - PREMIUM\s+(PERROS|GATOS|KG|PROT)/i, name: "OLD PRINCE - PREMIUM" },
  { re: /^ID\s+OLD PRINCE - EQUILIBRIUM\s+(CACHORROS|ADULTOS|GATOS|KG|PROT)/i, name: "OLD PRINCE - EQUILIBRIUM" },
  { re: /^ID\s+OLD PRINCE - NOVEL\s+(PERROS|GATOS|KG|PROT)/i, name: "OLD PRINCE - NOVEL" },
  { re: /^ID\s+CRIADORES|MAITENANCE|MAINTENANCE/i, name: "MAINTENANCE" },
  { re: /^ID\s+NATURAL MEAT/i, name: "NATURAL MEAT" },
  { re: /^ID\s+KONGO GOLD/i, name: "KONGO GOLD" },
  { re: /^ID\s+KONGO/i, name: "KONGO" },
  { re: /^ID\s+FAWNA/i, name: "FAWNA" },
  { re: /^ID\s+PELL\s*CAT/i, name: "PELLCAT" },
  { re: /^ID\s+PIEDRAS/i, name: "PIEDRAS SANITARIAS" },
  { re: /^ID\s+PRODUCTO PRESENTACION/i, name: "ZOOTEC" },
  { re: /^ID\s+PRODUCTO PESO/i, name: "MORDEDORES" },
];

const OLDPRINCE_HEADER = /^(ID|VETERINARIAS|PUBLICO|COMERCIOS|HIGIENE|ALIMENTOS|HIERBAS|MORDEDORES|PREMIOS|PRECIO|PROT\.?|KG|PESO|PRESENTACION|CANT|X\s+UN\.|SUGERIDO|GR|UNID|PRODUCTO|LISTA DE PRECIO)/i;

function parseOldPrince(text: string): RawProduct[] {
  const out: RawProduct[] = [];
  const lines = text.split("\n");
  let section = "";
  let hintSpecies: "perros" | "gatos" | null = null;

  const foodRe = /^(\d+)\s+(.+?)\s+([\d.,]+)\t\$\s+([\d.,]+)\t\$/;
  const singleRe = /^(\d+)\s+(.+?)\s+([\d.,]+)\t\$\s*$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Section header detection
    let matchedSection = false;
    for (const s of OLDPRINCE_SECTIONS) {
      if (s.re.test(line)) {
        section = s.name;
        if (/GATOS|GATITOS|CAT/i.test(line)) hintSpecies = "gatos";
        else if (/PERROS|CACHORROS/i.test(line)) hintSpecies = "perros";
        else hintSpecies = null;
        matchedSection = true;
        break;
      }
    }
    if (matchedSection) continue;
    if (OLDPRINCE_HEADER.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(line)) continue;
    if (!line.includes("\t$")) continue;

    // Food rows:  ID DESC KG PROT  VET $  PUB $
    let m = line.match(foodRe);
    let price: number;
    let identity: string;
    if (m) {
      price = parsePrice(m[4]);
      identity = m[2].replace(/\s+/g, " ").trim();
      // Split trailing "KG PROT" — keep KG for the description name
      const kgProt = identity.match(/(.+?)\s+([\d.,]+)\s+\d+\s*$/);
      if (kgProt) {
        identity = kgProt[1].trim();
        const kg = kgProt[2].replace(",", ".");
        identity = `${identity} X ${kg} KG`;
      }
    } else {
      // Single-price rows:  ID DESC PRESENTACION  PRICE $
      m = line.match(singleRe);
      if (!m) continue;
      price = parsePrice(m[3]);
      identity = m[2].replace(/\s+/g, " ").trim();
    }

    let description = identity;
    if (section) {
      const secNorm = section.replace(/\s*-\s*/g, " ").toUpperCase();
      if (!description.toUpperCase().includes(secNorm)) {
        description = `${section} ${description}`;
      }
    }
    description = description.replace(/\s+/g, " ").trim().toUpperCase();

    out.push({
      source: "oldprince",
      code: m[1],
      description,
      price,
      hintSpecies,
    });
  }
  return out;
}

function parseEukanubaRC(text: string): RawProduct[] {
  const out: RawProduct[] = [];
  const lines = text.split("\n");
  // Base description WITHOUT the size suffix, for inherited rows.
  let lastBase = "";
  let lastSpecies: "perros" | "gatos" | null = null;
  let hintSpecies: "perros" | "gatos" | null = null;

  // Codes: 6-8 digits (Eukanuba) or 5-char alphanumeric (RC, e.g. FA58A / CW34H).
  const CODE = "(\\d{6,8}|[A-Z]{1,2}\\d{2}[A-Z])";
  // Inherited rows (no description):  CODE KG PRICE_NO_IVA $ PUBLIC $
  const inheritRe = new RegExp(`^${CODE}\\s+([\\d.,]+)\\s+([\\d.,]+)\\t\\$\\s+([\\d.,]+)\\t\\$`);
  // Full rows:  [GAMA] CODE DESCRIPTION KG PRICE_NO_IVA $ PUBLIC $
  const fullRe = new RegExp(`(?:^|\\s)${CODE}\\s+(.+?)\\s+([\\d.,]+)\\s+([\\d.,]+)\\t\\$\\s+([\\d.,]+)\\t\\$`);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(VIGENCIA|GAMA|TALLA|PAGE)/i.test(line)) continue;
    if (!line.includes("$")) {
      // Section header line (no prices) — track species context.
      if (/FELINE/i.test(line)) hintSpecies = "gatos";
      else if (/CANINE|CYNOTECHNIC|CACHORROS|ADULTOS|SENIOR|FIT BODY/i.test(line)) hintSpecies = "perros";
      else if (/^GATO$/i.test(line)) hintSpecies = "gatos";
      else if (/^PUPPY$|^ADULTO$|^LAMB$/i.test(line)) hintSpecies = "perros";
      continue;
    }

    // 1) Try inherited row: only numbers after the code.
    let m = line.match(inheritRe);
    let code: string;
    let description: string;
    let price: number;
    if (m) {
      code = m[1];
      price = parsePrice(m[4]);
      const kg = m[2].replace(",", ".");
      description = lastBase ? `${lastBase} X ${kg} KG` : "";
    } else {
      // 2) Full row with description.
      m = line.match(fullRe);
      if (!m) continue;
      code = m[1];
      price = parsePrice(m[5]);
      let base = m[2].replace(/\s+/g, " ").trim();
      lastBase = base.replace(/\s+X\s+[\d.,]+\s*(?:KG|GRS?|GR)\s*$/i, "");
      const dkg = m[3];
      // If description doesn't already carry a weight unit, append it.
      description = /KG|GRS|GR\b/i.test(base) ? base : `${base} X ${dkg.replace(",", ".")} KG`;
    }

    if (!description) continue;
    description = description.replace(/\s+/g, " ").replace(/POUCH POUCH/i, "POUCH").trim().toUpperCase();

    let species: RawProduct["hintSpecies"] = null;
    if (/GATO|CAT|FELINE|KITTEN|BABYCAT/i.test(description)) {
      species = "gatos";
    } else if (/PERRO|DOG|CANINE|PUPPY|CYNOTECHNIC|CRIADORES/i.test(description)) {
      species = "perros";
    } else if (description.startsWith("EUKANUBA")) {
      species = "perros"; // Eukanuba dog line by default
    } else {
      species = hintSpecies;
    }

    lastSpecies = species ?? lastSpecies;

    out.push({
      source: "eukanuba",
      code,
      description,
      price,
      hintSpecies: species ?? lastSpecies,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification -> category tree + variants
// ---------------------------------------------------------------------------

const SECO_VARIANT_NAMES = ["Marca", "Etapa", "Segmento", "Tamaño"];
const HUMEDO_VARIANT_NAMES = ["Marca", "Sabor", "Formato"];
const PRESCRIPCION_VARIANT_NAMES = ["Marca", "Etapa", "Tamaño"];
const SNACK_VARIANT_NAMES = ["Marca", "Sabor", "Formato"];

const BRAND_FIRST_WORD: Record<string, string> = {
  BALANCED: "BALANCED",
  BELCAN: "BELCAN",
  BELCAT: "BELCAT",
  COMPLETE: "COMPLETE",
  "NATURAL RECIPE": "NATURAL RECIPE",
  "NATURAL REC.": "NATURAL RECIPE",
  NUTRIQUE: "NUTRIQUE",
  THERAPY: "THERAPY",
  EUKANUBA: "EUKANUBA",
  ROYAL: "ROYAL CANIN",
  HOP: "HOP!",
  DOGTOR: "DOGTOR",
  PREMIUM: "PREMIUM",
  OLD: "OLD PRINCE",
  FAWNA: "FAWNA",
  KONGO: "KONGO",
  MAINTENANCE: "MAINTENANCE",
  "NATURAL MEAT": "NATURAL MEAT",
  ZOOTEC: "ZOOTEC",
  MOISTY: "MOISTY CREAM",
  PELLCAT: "PELLCAT",
  BENCAT: "BENCAT",
  PIEDRAS: "PIEDRAS SANITARIAS",
  MORDEDORES: "MORDEDORES",
  "7 VIDAS": "7 VIDAS",
};

const ETAPA_RE = [
  { re: /CACHORRO|PUPPY|JUNIOR|GATITO|KITTEN|BABY|STARTER|CRIADORES/i, val: "Cachorro" },
  { re: /SENIOR|AGEING|\b7\+|\b8\+|\b11\+|\b12\+|\b5\+/i, val: "Senior" },
  { re: /ADULTO|ADULT|AD\.|MANTENIMIENTO|MAINTENANCE|YOUNG/i, val: "Adulto" },
];

const SABOR_RE = [
  { re: /POLLO/i, val: "POLLO" },
  { re: /CARNE/i, val: "CARNE" },
  { re: /CORDERO/i, val: "CORDERO" },
  { re: /SALMON/i, val: "SALMON" },
  { re: /MERLUZA/i, val: "MERLUZA" },
  { re: /TRUCHA/i, val: "TRUCHA" },
  { re: /SARDINA/i, val: "SARDINA" },
  { re: /HIGADO/i, val: "HIGADO" },
  { re: /CERDO/i, val: "CERDO" },
  { re: /PESCADO/i, val: "PESCADO" },
  { re: /VACUNO|VACUNA/i, val: "VACUNO" },
  { re: /COLAGENO|COLAGEN/i, val: "COLAGENO" },
];

function deriveEtapa(desc: string): string | null {
  for (const r of ETAPA_RE) if (r.re.test(desc)) return r.val;
  return null;
}

function deriveSabor(desc: string): string | null {
  for (const r of SABOR_RE) if (r.re.test(desc)) return r.val;
  return null;
}

function normalizeTamaño(raw: string): string {
  // "7,5KG" -> "7.5KG"; "1.20KG" -> "1.2KG"; "0.30KG" -> "0.3KG"; "350GR" -> "350GRS"
  let s = raw.replace(/\s+/g, "").toUpperCase().replace(/,/g, ".");
  const unitMatch = s.match(/(KG|GRS|GR|G)$/);
  if (!unitMatch) return s;
  const unit = unitMatch[1] === "GR" ? "GRS" : unitMatch[1];
  const num = s.slice(0, -unitMatch[1].length);
  const v = parseFloat(num);
  if (Number.isNaN(v)) return s;
  return `${v}${unit}`;
}

function deriveTamaño(desc: string): string | null {
  const m = desc.match(/X\s+([\d.,]+\s*(?:KG|GRS?|GR|KG\s*\)))\s*(?:\([^)]*\))?/i);
  if (m) return normalizeTamaño(m[1]);
  const m2 = desc.match(/(\d+\s*(?:KG|GRS?|GR|KG))\s*\([^)]*\)/i);
  if (m2) return normalizeTamaño(m2[1]);
  const m3 = desc.match(/(\d+)\s*(?:KG|GRS?)\b/i);
  if (m3) return normalizeTamaño(m3[0]);
  return null;
}

function normalizeFormato(raw: string): string {
  // "(X 12U)" -> "X12U"; "(340 GRS)" -> "340G"; "(12x85g)" -> "12X85G"
  let s = raw.replace(/\s+/g, "").toUpperCase();
  s = s.replace(/UNID$/i, "U");
  s = s.replace(/GRS?$/i, "G");
  return s;
}

function deriveFormato(desc: string): string | null {
  const m = desc.match(/\(([^)]*(?:G|GRS|GR|KG|U|UN)[^)]*)\)/i);
  if (m) return normalizeFormato(m[1]);
  const m2 = desc.match(/(\d+\s*(?:G|GRS|GR|KG)\b)/i);
  if (m2) return normalizeFormato(m2[1]);
  return null;
}

function classify(p: RawProduct): Classified {
  const d = p.description;
  const isWet = /WET|POUCH|LATA|SOFFLE|SOUFFLE|EN SALSA|SOFT CREAM|\b85G\b|\b85 G\b|\b100G\b|\b100 G\b|\b340G\b|\b340 GRS?\b|\b56 GR|\bLiquid\b/i.test(d);
  const isPrescription = /THERAPY|VETERINARY|GASTROINTESTINAL|HYPOALLERGENIC|RENAL|DIABETIC|SATIETY|CARDIAC|MOBILITY|ANALLERGENIC|RECOVERY|HEPATIC|URINARY\s+SO/i.test(d);
  const isSnack = /SNACK|PREMIOS|MORDEDORES|MOISTY|TREATS|SALCHICKS|CHORICKS|CATNIP|HIERBAS|PREMIUM EN SU SALSA/i.test(d);
  const isPiedras = /PELLCAT|BENCAT|PIEDRAS|ARENA|ABSORBENTE/i.test(d);
  const isAves = /ALPISTE|GIRASOL|NÉCTAR|TROPIMIX|CANARIOS|COLIBRI|MILFLORES|HENO|ALFALFA|CASITA|MIX FRUTAS.*(?:AVES|ROEDORES)/i.test(d) && /PERRO|GATO|CAT|DOG|CANINE|FELINE/i.test(d) === false;
  const isRoedores = /ROEDORES|HENO|ALFALFA|CASITA/i.test(d);

  const species: Classified["species"] = /GATO|CAT|FELINE|KITTEN|BABYCAT/i.test(d)
    ? "gatos"
    : /PERRO|DOG|CANINE|PUPPY|JUNIOR|CACHORRO|CRIADORES/i.test(d)
      ? "perros"
      : isAves
        ? "aves"
        : isRoedores
          ? "roedores"
          : p.hintSpecies ?? (p.source === "vitalcan" || p.source === "oldprince" ? "perros" : null);

  // Brand: first recognized brand anywhere in the description, in word order.
  let brand: string | null = null;
  const firstWord = d.split(" ")[0] || "";
  if (BRAND_FIRST_WORD[firstWord]) {
    brand = BRAND_FIRST_WORD[firstWord];
  } else {
    // Royal Canin lines in the Eukanuba/RC PDF never say "ROYAL CANIN" —
    // everything not Eukanuba-branded in that source is Royal Canin.
    if (p.source === "eukanuba" && /EUKANUBA/.test(d) === false) {
      brand = "ROYAL CANIN";
    } else {
      for (const [k, v] of Object.entries(BRAND_FIRST_WORD)) {
        if (new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s|-|\\d|\\()`, "i").test(d)) {
          brand = v;
          break;
        }
      }
    }
  }
  if (brand === null && (/^V\d+/.test(d) || d.includes("LINEA V"))) brand = "LINEA V";
  if (brand === null && p.source === "oldprince") {
    // Old Prince food sections carry the section name as brand prefix.
    const sec = d.split(" ")[0] || "";
    if (/^(MAINTENANCE|NATURAL|KONGO|FAWNA|PELLCAT|PIEDRAS|ZOOTEC|MORDEDORES|OLD)$/.test(sec)) {
      brand = sec === "OLD" ? "OLD PRINCE" : sec === "NATURAL" ? "NATURAL MEAT" : sec;
    }
  }

  // Segment
  let segmento: string | null = null;
  if (isPrescription || /THERAPY/.test(d)) segmento = "Prescripción Médica";
  else if (/NR ESPEC/.test(d)) segmento = "Natural";
  else if (/ESPEC/.test(d)) segmento = "Premium";
  else if (/MASIVO/.test(d)) segmento = "Mainstream";
  else if (/NOVEL|NATURAL/i.test(d)) segmento = "Natural";

  const etapa = deriveEtapa(d);
  const sabor = deriveSabor(d);
  const tamaño = deriveTamaño(d);
  const formato = isWet ? deriveFormato(d) : null;

  // Category path
  let kind: Classified["kind"] = "seco";
  if (isPrescription) kind = "prescripcion";
  else if (isWet) kind = "humedo";
  else if (isSnack || isPiedras) kind = "snack";

  const root = "ALIMENTACIÓN Y NUTRICIÓN";
  let categoryPath: string[];

  if (isPiedras) {
    categoryPath = ["ESTÉTICA E HIGIENE", "Piedras y Sanitarios para Gatos"];
    kind = "snack";
  } else if (species === "aves") {
    categoryPath = [root, "Aves", "Alimento para Aves"];
  } else if (species === "roedores") {
    categoryPath = [root, "Roedores", "Alimento para Roedores"];
  } else if (!species) {
    categoryPath = [root, "Otros", "Alimento Balanceado"];
  } else if (kind === "prescripcion") {
    categoryPath = [root, species === "gatos" ? "Gatos" : "Perros", "Prescripción Médica / Medicado"];
  } else if (kind === "humedo") {
    categoryPath = [
      root,
      species === "gatos" ? "Gatos" : "Perros",
      species === "gatos" ? "Alimento Húmedo (Pouch / Latas)" : "Alimento Húmedo (Latas / Sobres)",
    ];
  } else if (kind === "snack") {
    categoryPath = [
      root,
      species === "gatos" ? "Gatos" : "Perros",
      species === "gatos" ? "Snacks y Golosinas (Catnip, Churu, etc.)" : "Snacks, Premios y Golosinas",
    ];
  } else {
    categoryPath = [root, species === "gatos" ? "Gatos" : "Perros", "Alimento Seco (Balanceado)"];
  }

  return {
    kind,
    species,
    categoryPath,
    brand,
    etapa,
    segmento,
    tamaño,
    sabor,
    formato,
  };
}

// ---------------------------------------------------------------------------
// DB helpers (only in full mode)
// ---------------------------------------------------------------------------

async function ensureCategory(orgId: string, path: string[]): Promise<string> {
  let parentId: string | null = null;
  let current: string | null = null;
  for (const name of path) {
    const found = await basePrisma.category.findFirst({
      where: { name, organizationId: orgId, parentId },
    });
    if (found) {
      current = found.id;
    } else {
      const created = await basePrisma.category.create({
        data: { name, organizationId: orgId, parentId },
      });
      current = created.id;
    }
    parentId = current;
  }
  if (!current) throw new Error(`Could not ensure category path: ${path.join(" > ")}`);
  return current;
}

async function ensureVariantDef(categoryId: string, orgId: string, name: string): Promise<string> {
  let vd = await basePrisma.categoryVariantDefinition.findFirst({
    where: { categoryId, name, organizationId: orgId },
  });
  if (!vd) {
    vd = await basePrisma.categoryVariantDefinition.create({
      data: { categoryId, name, organizationId: orgId },
    });
  }
  return vd.id;
}

async function ensureOption(variantDefId: string, orgId: string, value: string): Promise<string> {
  let opt = await basePrisma.categoryVariantOption.findFirst({
    where: { variantId: variantDefId, value, organizationId: orgId },
  });
  if (!opt) {
    opt = await basePrisma.categoryVariantOption.create({
      data: { variantId: variantDefId, value, organizationId: orgId },
    });
  }
  return opt.id;
}

async function upsertProduct(
  orgId: string,
  p: RawProduct,
  c: Classified,
  dryRun: boolean,
): Promise<"created" | "updated" | "skipped"> {
  const catId = await ensureCategory(orgId, c.categoryPath);
  const variantNames =
    c.kind === "humedo" || c.kind === "snack"
      ? HUMEDO_VARIANT_NAMES
      : c.kind === "prescripcion"
        ? PRESCRIPCION_VARIANT_NAMES
        : SECO_VARIANT_NAMES;

  const vdIds: Record<string, string> = {};
  for (const name of variantNames) vdIds[name] = await ensureVariantDef(catId, orgId, name);

  const optionValues: Record<string, string> = {};
  if (c.brand) optionValues["Marca"] = c.brand;
  if (c.etapa && vdIds["Etapa"]) optionValues["Etapa"] = c.etapa;
  if (c.segmento && vdIds["Segmento"]) optionValues["Segmento"] = c.segmento;
  if (c.tamaño && vdIds["Tamaño"]) optionValues["Tamaño"] = c.tamaño;
  if (c.sabor && vdIds["Sabor"]) optionValues["Sabor"] = c.sabor;
  if (c.formato && vdIds["Formato"]) optionValues["Formato"] = c.formato;

  const existing = await basePrisma.product.findFirst({
    where: { organizationId: orgId, code: p.code },
    include: { variantAssignments: true },
  });

  if (existing) {
    if (dryRun) return "skipped";
    await basePrisma.product.update({
      where: { id: existing.id },
      data: { name: p.description, price: p.price, categoryId: catId },
    });
    // Re-sync variant assignments
    await basePrisma.productVariant.deleteMany({ where: { productId: existing.id } });
    for (const [vName, value] of Object.entries(optionValues)) {
      const optId = await ensureOption(vdIds[vName], orgId, value);
      await basePrisma.productVariant.create({
        data: { productId: existing.id, optionId: optId, organizationId: orgId },
      });
    }
    return "updated";
  }

  if (dryRun) return "skipped";

  const product = await basePrisma.product.create({
    data: {
      name: p.description,
      price: p.price,
      quantity: 0,
      categoryId: catId,
      organizationId: orgId,
      code: p.code,
    },
  });

  for (const [vName, value] of Object.entries(optionValues)) {
    const optId = await ensureOption(vdIds[vName], orgId, value);
    await basePrisma.productVariant.create({
      data: { productId: product.id, optionId: optId, organizationId: orgId },
    });
  }
  return "created";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "FULL LOAD"}`);

  let org = null;
  if (!dryRun) {
    org = await basePrisma.organization.findFirst({ where: { slug: ORG_SLUG } });
    if (!org) {
      console.error(`Organization "${ORG_SLUG}" not found`);
      process.exit(1);
    }
    console.log(`Organization: ${org.name}`);
  }

  const all: RawProduct[] = [];
  for (const [key, path] of Object.entries(PDFS)) {
    const text = await readPdfText(path);
    let parsed: RawProduct[] = [];
    if (key === "vitalcan") parsed = parseVitalcan(text);
    else if (key === "oldprince") parsed = parseOldPrince(text);
    else parsed = parseEukanubaRC(text);
    console.log(`Parsed ${key}: ${parsed.length} rows`);
    all.push(...parsed);
  }

  // Dedupe by code (keep first)
  const seen = new Set<string>();
  const dupes: string[] = [];
  const unique = all.filter((p) => {
    if (seen.has(p.code)) {
      dupes.push(`${p.code} (${p.source})`);
      return false;
    }
    seen.add(p.code);
    return true;
  });
  if (dupes.length) console.log(`Duplicates dropped: ${dupes.join(", ")}`);
  console.log(`Total unique: ${unique.length}`);

  // Dry-run summary by category
  const byCat = new Map<string, number>();
  const badClass = new Map<string, number>();
  for (const p of unique) {
    const c = classify(p);
    if (c.species === null && c.categoryPath[1] === "Otros") {
      badClass.set(p.description, (badClass.get(p.description) || 0) + 1);
      console.log(`[UNCLASSIFIED] ${p.source} ${p.code}: ${p.description} @ ${p.price}`);
    }
    const key = c.categoryPath.join(" > ");
    byCat.set(key, (byCat.get(key) || 0) + 1);
  }

  if (process.argv.includes("--brand-audit")) {
    const brandAudit = new Map<string, string[]>();
    for (const p of unique) {
      const c = classify(p);
      if (!c.brand) continue;
      if (!brandAudit.has(c.brand)) brandAudit.set(c.brand, []);
      const arr = brandAudit.get(c.brand)!;
      if (arr.length < 2) arr.push(`${p.source}:${p.code} ${p.description}`);
    }
    const known = new Set(Object.values(BRAND_FIRST_WORD));
    console.log("\n=== BRAND AUDIT (suspicious = not in dictionary) ===");
    for (const [brand, ex] of [...brandAudit.entries()].sort()) {
      const suspicious = !known.has(brand) && !/^LINEA V$/.test(brand);
      if (suspicious) console.log(`  [${brand}] ${ex.join(" || ")}`);
    }
    console.log(`\nBrands total: ${brandAudit.size}, suspicious: ${[...brandAudit.keys()].filter((b) => !known.has(b) && b !== "LINEA V").length}`);
    return;
  }

  console.log("\n=== Category distribution (dry) ===");
  for (const [k, v] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }

  // Dry-run variant preview: definitions + option values per category
  const variantPreview = new Map<string, Map<string, Set<string>>>();
  for (const p of unique) {
    const c = classify(p);
    const catKey = c.categoryPath.join(" > ");
    if (!variantPreview.has(catKey)) variantPreview.set(catKey, new Map());
    const defs = variantPreview.get(catKey)!;
    const names =
      c.kind === "humedo" || c.kind === "snack"
        ? HUMEDO_VARIANT_NAMES
        : c.kind === "prescripcion"
          ? PRESCRIPCION_VARIANT_NAMES
          : SECO_VARIANT_NAMES;
    for (const name of names) {
      if (!defs.has(name)) defs.set(name, new Set());
      const value =
        name === "Marca" ? c.brand :
        name === "Etapa" ? c.etapa :
        name === "Segmento" ? c.segmento :
        name === "Tamaño" ? c.tamaño :
        name === "Sabor" ? c.sabor : c.formato;
      if (value) defs.get(name)!.add(value);
    }
  }
  console.log("\n=== Variant preview (dry) ===");
  for (const [cat, defs] of variantPreview) {
    console.log(`  ${cat}`);
    for (const [name, values] of defs) {
      console.log(`    ${name}: ${[...values].sort().join(" | ")}`);
    }
  }

  if (dryRun) {
    console.log("\nDry run complete. No DB writes.");
    return;
  }

  // Full load
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const p of unique) {
    const c = classify(p);
    try {
      const status = await upsertProduct(org.id, p, c, false);
      if (status === "created") created++;
      else if (status === "updated") updated++;
      else skipped++;
    } catch (e: any) {
      console.error(`  ERROR ${p.code} ${p.description}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`\n=== DONE: ${created} created, ${updated} updated, ${skipped} skipped/errors ===`);
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });
