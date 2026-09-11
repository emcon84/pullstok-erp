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

/** Especie de un producto (para no mezclar perros/gatos/medicados en la
 * planilla). Prioridad: keywords del NOMBRE (más explícitas) → línea/sublínea de
 * la sección → categoría. Los medicados/terapéuticos van primero y unifican
 * VETERINARY FELINE + CANINE. */
const VET_KEY = /\b(VETERINARY|HYPOALLERGENIC|ANALLERGENIC|RENAL|GASTRO|HEPATIC|URINARY|DIABETIC|CARDIAC|MOBILITY|SATIETY|RECOVERY|FIBRE|CALM|DERMATO|NEUTERED|MATURE|ALLERGENIC|WEIGHT CONTROL|THERAPY)\b/i;
const DOG_KEY = /\b(PUPPY|CACHORRO|ADULT|ADULTO|SENIOR|DOG|PERRO|CANINE|FIT BODY|OVEJERO|LABRADOR|GOLDEN|BULLDOG|POODLE|CANICHE|YORKSHIRE|DACHSHUND|CHIHUAHUA|SCHNAUZER|PUG|BOXER|SIZE|MINI|MAXI|GIANT)\b/i;
const CAT_KEY = /\b(KITTEN|GATITO|GATO|CAT|BABYCAT|FELINE|INDOOR|PERSIAN|SIAMESE|LONGHAIR|MOUSSE|POUCH|LATA)\b/i;

export const speciesOf = (
  name: string,
  line: string | null | undefined,
  subline: string | null | undefined,
  categoryName?: string | null,
): "PERRO" | "GATO" | "MEDICADOS" | "OTROS" => {
  const n = (name ?? "").toUpperCase();
  const l = (line ?? "").toUpperCase();
  const s = (subline ?? "").toUpperCase();
  const c = (categoryName ?? "").toUpperCase();
  const section = `${l} ${s}`;
  // Medicados/terapéuticos primero (marca la ganancia distinta); si el nombre o
  // la línea lo dicen, es MEDICADOS aunque no traiga FELINE/CANINE en el name.
  if (VET_KEY.test(n) || VET_KEY.test(section) || VET_KEY.test(c)) return "MEDICADOS";
  // Perro (nombre más explícito que la línea: "EUKANUBA PUPPY" no dice PERRO
  // pero sí PUPPY/ADULT/SENIOR).
  if (DOG_KEY.test(n)) return "PERRO";
  // Gato.
  if (CAT_KEY.test(n)) return "GATO";
  // Respaldo por línea/sublínea/categoría.
  if (/FELINE|CAT|GATO|KITTEN|BABYCAT|LONGHAIR|POUCH|LATA|MOUSSE/.test(section) || /GATO|CAT|FELINE|KITTEN/.test(c)) return "GATO";
  if (/CANINE|PERRO|DOG|PUPPY|CACHORRO|ADULT|SENIOR|FIT BODY|SIZE/.test(section) || /PERRO|DOG|CANINE/.test(c)) return "PERRO";
  return "OTROS";
};

/** Gama/sublínea para la bandita bajo la especie. Unifica VETERINARY
 * FELINE/CANINE en una sola "VETERINARY". */
export const gamaOf = (
  name: string,
  line: string | null | undefined,
): string => {
  const lin = normalizeLine(line ?? null);
  if (lin) {
    if (/VETERINARY/i.test(lin)) return "VETERINARY";
    return tallaOf(lin) || lin || "";
  }
  return tallaFromName(name) ?? "";
};

export const SPECIES_COLORS: Record<string, [number, number, number]> = {
  PERRO: [17, 24, 39],
  GATO: [126, 34, 206],
  MEDICADOS: [146, 64, 14],
  OTROS: [100, 116, 139],
};

export const BRAND_COLORS: Record<string, [number, number, number]> = {
  EUKANUBA: [16, 122, 87],
  "ROYAL CANIN": [157, 23, 77],
  MONKCAT: [146, 64, 14],
  WIPUP: [2, 132, 199],
  ASADITOS: [190, 24, 93],
};
