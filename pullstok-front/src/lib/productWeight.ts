import type { DataItem } from "../types";

/**
 * Peso de bolsa cerrada derivado del NOMBRE cuando weightKg no está cargado
 * (muchos productos traen "X15KG", "X 18 K", "X500G"...).
 *
 * Cuidado: los multi-pack húmedos ("15X85G", "15 S X 100GR") representan
 * "15 sobres x 85 g", NO "15 kg" → devuelven null (para no ordenarlos mal).
 */
export const parseWeightFromName = (name?: string): number | null => {
  if (!name) return null;
  const n = name;
  // Multi-pack / sachets (wet): 15X85G, 15X100G, 15 S X 100GR, 15x100g → sin peso de bolsa.
  if (/\d+\s*x\s*\d+(?:[.,]\d+)?\s*g\w*/i.test(n)) return null;
  if (/\d+\s*s\s*x\s*\d+\s*g\w*/i.test(n)) return null;
  // X{n}KG / X{n}K (ej. X15KG, X3KG, X2,7KG, X 18 K)
  let m = n.match(/x\s*(\d+(?:[.,]\d+)?)\s*k\w*\b/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  // {n}KG / {n} K con espacio (ej. "15 KG", " 8 KG")
  m = n.match(/(\d+(?:[.,]\d+)?)\s*k\w*\b/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  // X{n}G / {n} GRS en gramos (ej. X500G, 500 GRS) → a kg
  m = n.match(/x\s*(\d+(?:[.,]\d+)?)\s*g\w*\b/i) || n.match(/(\d+(?:[.,]\d+)?)\s*grs\b/i);
  if (m) {
    const grams = parseFloat(m[1].replace(",", "."));
    return grams > 0 ? grams / 1000 : null;
  }
  return null;
};

/** Peso efectivo: prioriza el campo weightKg; si falta, lo saca del nombre. */
export const productWeight = (p: DataItem): number | null => {
  const w = Number(p.weightKg);
  if (w && w > 0) return w;
  return parseWeightFromName(p.name);
};

/** Display: "15 kg", "7,5 kg" o "—" si es desconocido. */
export const formatWeight = (p: DataItem): string => {
  const w = productWeight(p);
  if (w == null) return "—";
  const formatted = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(".", ",");
  return `${formatted} kg`;
};
