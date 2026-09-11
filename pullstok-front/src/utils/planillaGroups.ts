/**
 * Helpers compartidos de agrupación/rotulado para los PDF de la planilla
 * mayorista y de la actualización de precios. Se usa en exportPlanillaPdf y
 * exportBulkPricePdf para que ambos tengan EXACTAMENTE el mismo diseño
 * (seco/húmedo → marca → talla → razas) y las mismas bandas de color.
 */

export const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "-"
    : `$${Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`;

export const redondearPrecio = (n: number | null | undefined): number | null =>
  n == null ? null : n >= 500 ? Math.round(n / 100) * 100 : n;

export const esHumedito = (nombre: string): boolean =>
  /\b(WET|HÚMEDO|HUMEDO|POUCH|LATA|LÍQUIDO|LIQUID|MOUSSE)\b/i.test(nombre);

export const normalizeLine = (line: string | null): string | null => {
  if (!line) return line;
  const l = line.trim().toUpperCase();
  if (/^ADULTO$/i.test(l)) return "ADULT";
  if (/^GATOADULTO$/i.test(l)) return "GATO ADULTO";
  if (/^CACHORRO$/i.test(l)) return "CACHORROS";
  return line;
};

const LEAK_PREFIX =
  /^(?:RAZAS?\s+(?:PEQUEÑAS|PEQUENAS|MEDIANAS|GRANDES)|ADULTOS?|CACHORROS?|SENIOR|PUPPY|KITTEN|HÚMEDO|HUMEDO)\s+/i;

export const displayName = (nombre: string, brand: string | null | undefined): string => {
  let n = nombre.replace(LEAK_PREFIX, "");
  n = n.replace(/^\d{5,8}\s+/, "");
  n = n.replace(/^[A-Z]{2}\d{2,3}[A-Z]?\s+/, "");
  if (brand && !n.toUpperCase().startsWith(brand.toUpperCase())) {
    n = `${brand} ${n}`;
  }
  return n.replace(/\s+/g, " ").trim();
};

/** Productos NO alimento (limpieza, piedra sanitaria...) que no van en la lista. */
const NON_FOOD =
  /\b(CITRICA|LAVANDA|MARINA|NEUTRA|LIMÓN|LIMON|MANZANA|ROSAS|MONKCAT|BENTONITA|SÍLICA|SILICA|PIEDRAS SANITARIAS|ARENA)\b/i;

export const isNonFood = (nombre: string, unit: string | null): boolean =>
  NON_FOOD.test(nombre) || /^\d+([.,]\d+)?\s*[lL]$/.test(unit ?? "");

/** TALLA / etapa en el rotulado del proveedor (desde la línea o el nombre). */
export const tallaOf = (line: string | null): string => {
  const l = (line ?? "").trim().toUpperCase();
  if (l === "PUPPY" || /\bPUPPY\b/.test(l)) return "CACHORROS";
  if (l === "ADULT" || /\bADULT|\bADULTO\b/.test(l)) return "ADULTOS";
  if (l === "KITTEN" || /\bKITTEN\b/.test(l)) return "GATOS";
  if (l === "SENIOR" || /\bSENIOR\b/.test(l)) return "SENIOR";
  return line ?? "";
};

/** TALLA derivada del NOMBRE (para filas sin sección): SOLO etapas conocidas,
 * sino null. Evita que un nombre sin etapa se vuelva un "título" raro. */
export const tallaFromName = (nombre: string): string | null => {
  const n = (nombre ?? "").toUpperCase();
  if (/\bPUPPY\b/.test(n)) return "CACHORROS";
  if (/\bADULT\b|\bADULTO\b/.test(n)) return "ADULTOS";
  if (/\bSENIOR\b/.test(n)) return "SENIOR";
  if (/\bKITTEN\b|\bGATO\b/.test(n)) return "GATOS";
  return null;
};

/** Categoría/linha (FELINE/CANINE/VETERINARY) derivada del NOMBRE, como
 * respaldo cuando la sección no trae la línea. Los nombres de Royal Canin la
 * traen clara. */
const VET_KEYWORDS =
  /\b(VETERINARY|HYPOALLERGENIC|ANALLERGENIC|RENAL|GASTRO|HEPATIC|URINARY|SATIETY|DIABETIC|MOBILITY|CARDIAC|FIBRE|CALM|RECOVERY)\b/;
const FELINE_KEYWORDS =
  /\b(CAT|GATO|FELINE|KITTEN|BABYCAT|INDOOR|PERSIAN|SIAMESE|EXIGENT|SENSIBLE|LONGHAIR|MOUSSE|POUCH|LATA)\b/;
const CANINE_KEYWORDS = /\b(DOG|PERRO|CANINE)\b/;

export const lineFromName = (nombre: string): string | null => {
  const n = (nombre ?? "").toUpperCase();
  if (FELINE_KEYWORDS.test(n)) {
    return VET_KEYWORDS.test(n) ? "VETERINARY FELINE" : "FELINE";
  }
  if (CANINE_KEYWORDS.test(n)) {
    return VET_KEYWORDS.test(n) ? "VETERINARY CANINE" : "CANINE";
  }
  return null;
};

/** Especie (PERRO/GATO) derivada del NOMBRE del producto. Los keywords de
 * Royal Canin (y afines) distinguen claramente la especie. Devuelve "" si no
 * hay match o si hay ambos (ambiguo). */
const CAT_SPECIES_KEYWORDS =
  /\b(CAT|GATO|FELINE|KITTEN|BABYCAT|INDOOR|PERSIAN|SIAMESE|LONGHAIR|MOUSSE|POUCH|LATA)\b/i;
const DOG_SPECIES_KEYWORDS =
  /\b(PUPPY|DOG|CANINE|PERRO|CACHORRO|JACK RUSSELL|GOLDEN RETRIEVER|PUG|BULLDOG|CYNOTECHNIC|YORKSHIRE|DACHSHUND|CHIHUAHUA|POODLE|CANICHE|LABRADOR|BOXER|SCHNAUZER)\b/i;

export const speciesOfName = (name: string): "PERRO" | "GATO" | "" => {
  const n = (name ?? "").toUpperCase();
  const cat = CAT_SPECIES_KEYWORDS.test(n);
  const dog = DOG_SPECIES_KEYWORDS.test(n);
  if (cat && dog) return "";
  if (cat) return "GATO";
  if (dog) return "PERRO";
  return "";
};

/** Sub-categoría limpia derivada del NOMBRE (para la columna Categoría/Talla).
 * Reemplaza el `tipo` genérico del parser (ej. "RAZAS PEQ") por la sub-categoría
 * real del producto (Kitten/Indoor/Sensory/Húmedos...). Devuelve "" si no
 * matchea. El orden importa: las reglas más específicas van PRIMERO para que
 * ganen sobre las genéricas (ej. GATO ADULTO antes de ADULTOS; tallas MINI/
 * MEDIUM/MAXI/GIANT antes de las etapas genéricas PUPPY/ADULT). */
const SUB_CATEGORY_RULES: [RegExp, string][] = [
  // Húmedos primero: POUCH/LATA/WET/HÚMEDO/HUMEDO/MOUSSE ganan siempre.
  [/\b(POUCH|LATA|WET|HÚMEDO|HUMEDO|MOUSSE)\b/i, "HÚMEDOS"],
  // Líneas y razas felinas / veterinarias específicas.
  [/\b(KITTEN|BABYCAT)\b/i, "KITTEN"],
  [/\bGATO\s*ADULTO\b/i, "GATO ADULTO"],
  [/\b(TRAINING\s*TREATS|TREATS)\b/i, "TREATS"],
  [/\bINDOOR\b/i, "INDOOR"],
  [/\bSENSORY\b/i, "SENSORY"],
  [/\bPERSIAN\b/i, "PERSIAN"],
  [/\bSIAMESE\b/i, "SIAMESE"],
  [/\bSENSIBLE\b/i, "SENSIBLE"],
  [/\bEXIGENT\b/i, "EXIGENT"],
  [/\bAPPETITE\b/i, "APPETITE"],
  [/\bHAIRBALL\b/i, "HAIRBALL"],
  [/\bHAIR\s*&\s*SKIN\b/i, "HAIR & SKIN"],
  [/\bWEIGHT\b/i, "WEIGHT"],
  [/\bURINARY\b/i, "URINARY"],
  [/\bDIGEST/i, "DIGEST"],
  [/\bGASTRO/i, "GASTRO"],
  [/\bHEPATIC\b/i, "HEPATIC"],
  [/\bRENAL\b/i, "RENAL"],
  [/\bCARDIAC\b/i, "CARDIAC"],
  [/\bMOBILITY\b/i, "MOBILITY"],
  [/\bDIABETIC\b/i, "DIABETIC"],
  [/\bSATIETY\b/i, "SATIETY"],
  [/\b(HYPOALLERGENIC|ANALLERGENIC|ALLERGENIC)\b/i, "ALLERGENIC"],
  [/\bFIT\b/i, "FIT"],
  [/\bACTIVE\s*7\b/i, "ACTIVE 7+"],
  [/\b(GROWTH|MOTHER)\b/i, "GROWTH"],
  // Tallas (perro): antes que las etapas genéricas para que "MINI ADULT" y
  // "X-SMALL PUPPY" queden en MINI.
  [/\b(X-SMALL|XSMALL|MINI)\b/i, "MINI"],
  [/\bMEDIUM\b/i, "MEDIUM"],
  [/\bMAXI\b/i, "MAXI"],
  [/\bGIANT\b/i, "GIANT"],
  // Etapas genéricas al final (después de GATO ADULTO y de las tallas).
  [/\bSENIOR\b/i, "SENIOR"],
  [/\b(PUPPY|CACHORRO|CACHORROS)\b/i, "CACHORROS"],
  [/\b(ADULT|ADULTO|ADULTOS)\b/i, "ADULTOS"],
];

export const subCategoryFromName = (name: string): string => {
  const n = (name ?? "").toUpperCase();
  for (const [re, cat] of SUB_CATEGORY_RULES) {
    if (re.test(n)) return cat;
  }
  return "";
};

/** Peso en KG extraído del nombre (ej. "X 1.5 KG", "X 15 KG", "X 1,5 Kg").
 * Devuelve Infinity si no hay peso, para que los productos sin peso vayan al
 * final al ordenar dentro de una sub-categoría. */
export const weightKgOf = (name: string): number => {
  const m = (name ?? "").match(/X\s*([\d.,]+)\s*KG/i);
  if (!m) return Infinity;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : Infinity;
};

/** Corrige la GAMA según la especie derivada del nombre, para que los gatos no
 * queden bajo una gama canina (y viceversa). Si el parser etiquetó mal, se
 * normaliza a FELINE/CANINE (o VETERINARY FELINE/CANINE). */
export const gamaBySpecies = (gama: string, name: string): string => {
  const species = speciesOfName(name);
  const g = (gama ?? "").trim().toUpperCase();
  if (!species || !g) return gama ?? "";
  if (species === "GATO" && /\bCANINE\b/.test(g)) {
    return g === "VETERINARY CANINE" ? "VETERINARY FELINE" : "FELINE";
  }
  if (species === "PERRO" && /\bFELINE\b/.test(g)) {
    return g === "VETERINARY FELINE" ? "VETERINARY CANINE" : "CANINE";
  }
  return gama ?? "";
};

/** Razas (Pequeñas/Medianas/Grandes) derivadas del nombre o sublínea. */
export const razasOf = (nombre: string, subline: string | null): string | null => {
  const n = nombre.toUpperCase();
  const s = (subline ?? "").toUpperCase();
  if (/\b(MINI|X-SMALL|X SMALL|SMALL BREED)\b/.test(n) || /PEQUEÑA|PEQUENA|SMALL|MINI/.test(s)) return "RAZAS PEQUEÑAS";
  if (/\b(MEDIUM BREED)\b/.test(n) || /MEDIANA|MEDIUM/.test(s)) return "RAZAS MEDIANAS";
  if (/\b(LARGE BREED|MAXI|GIANT)\b/.test(n) || /GRANDE|MAXI|LARGE/.test(s)) return "RAZAS GRANDES";
  return null;
};

export const TALLA_COLORS: Record<string, [number, number, number]> = {
  CACHORROS: [88, 28, 135],
  ADULTOS: [17, 24, 39],
  SENIOR: [30, 58, 138],
  GATOS: [126, 34, 206],
};

export const RAZAS_COLORS: Record<string, [number, number, number]> = {
  "RAZAS PEQUEÑAS": [107, 33, 168],
  "RAZAS MEDIANAS": [180, 83, 9],
  "RAZAS GRANDES": [14, 116, 144],
};

/** Abrevia palabras largas de las categorías para que no se partan en la
 * columna Categoría/Talla (ej. GASTROINTESTINAL → GASTRO). */
const CAT_WORD_ABBREV: Record<string, string> = {
  PEQUEÑAS: "PEQ",
  PEQUENAS: "PEQ",
  MEDIANAS: "MED",
  GRANDES: "GR",
  MANAGEMENT: "MGMT",
  GASTROINTESTINAL: "GASTRO",
  DERMATOLOGY: "DERM",
  VETERINARY: "VET",
  SUPPORT: "SUP",
};
export const abbreviateCategoria = (cat: string): string =>
  cat
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((w) => CAT_WORD_ABBREV[w] ?? w)
    .join(" ");

export const BRAND_COLORS: Record<string, [number, number, number]> = {
  EUKANUBA: [16, 122, 87],
  "ROYAL CANIN": [157, 23, 77],
  MONKCAT: [146, 64, 14],
  WIPUP: [2, 132, 199],
  ASADITOS: [190, 24, 93],
};

/** Orden de marcas en la planilla impresa: ROYAL CANIN primero, las demás en
 * el medio (orden de primera aparición), EUKANUBA al final. */
export const brandOrder = (brand: string): number => {
  const b = (brand ?? "").toUpperCase();
  if (b === "ROYAL CANIN") return 0;
  if (b === "EUKANUBA") return 999;
  return 100;
};
