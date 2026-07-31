/**
 * Load ~285 products from Old Prince, Vitalcan, Eukanuba, and Royal Canin
 * into the "El Almacen de las Mascotas" organization.
 *
 * Usage:
 *   npx ts-node api/scripts/load-oldprince-vitalcan-eukanuba-rc.ts
 */

import "dotenv/config";
import { basePrisma } from "../src/config/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SecoProduct {
  name: string;
  category: "seco-perros" | "seco-gatos";
  brand: string;
  segmento: string;
  tamaño: string;
  price?: number;
}

interface HumedoProduct {
  name: string;
  category: "humedo-perros" | "humedo-gatos";
  brand: string;
  sabor: string;
  formato: string;
  price?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHORRO_RE = /CACHORRO|PUPPY|JUNIOR|KITTEN|GATITO/i;
const SENIOR_RE = /SENIOR|AGEING|7\+|8\+|11\+|12\+|5\+/i;
const ADULTO_RE = /ADULTO|ADULT/i;

function deriveEtapa(name: string): string | null {
  if (CACHORRO_RE.test(name)) return "Cachorro";
  if (SENIOR_RE.test(name)) return "Senior";
  if (ADULTO_RE.test(name)) return "Adulto";
  return null;
}

function shortCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .map((w) => (w === "KG" || /^\d/.test(w) ? w : w[0] || ""))
    .join("")
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Product data — OLD PRINCE (seco only)
// ---------------------------------------------------------------------------

const oldPrinceProducts: SecoProduct[] = [
  // --- Premium Perros ---
  { name: "OLD PRINCE PREMIUM CACHORRO 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM CACHORRO 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Premium", tamaño: "15 KG" },
  { name: "OLD PRINCE PREMIUM ADULTOS 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM ADULTOS 20 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Premium", tamaño: "20 KG" },
  { name: "OLD PRINCE PREMIUM CORDERO Y ARROZ 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM CORDERO Y ARROZ 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Premium", tamaño: "15 KG" },

  // --- Premium Gatos ---
  { name: "OLD PRINCE PREMIUM GATITO 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM GATITO 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "OLD PRINCE PREMIUM GATO ADULTO 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM GATO ADULTO 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "OLD PRINCE PREMIUM GATO CORDERO ADULTO 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM GATO CORDERO ADULTO 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "OLD PRINCE PREMIUM GATO URINARIO 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE PREMIUM GATO URINARIO 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Premium", tamaño: "7.5 KG" },

  // --- Equilibrium Perros (Super Premium) ---
  { name: "OLD PRINCE CACHORRO MORDIDA PEQUEÑA 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE CACHORRO MORDIDA PEQUEÑA 7.5 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "OLD PRINCE EQUILIBRIUM CACHORRO MYG 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE EQUILIBRIUM CACHORRO MYG 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "OLD PRINCE ADULTO MORDIDA PEQUEÑA 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE ADULTO MORDIDA PEQUEÑA 7.5 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "OLD PRINCE ADULTO MORDIDA PEQUEÑA 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "OLD PRINCE EQUILIBRIUM ADULTO MYG 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE EQUILIBRIUM ADULTO MYG 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "OLD PRINCE EQUILIBRIUM ADULTO MYG 20 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "20 KG" },
  { name: "OLD PRINCE WEIGHT CONTROL 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE WEIGHT CONTROL 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "15 KG" },

  // --- Equilibrium Gatos (Super Premium) ---
  { name: "OLD PRINCE EQUILIBRIUM KITTEN 1 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "1 KG" },
  { name: "OLD PRINCE EQUILIBRIUM KITTEN 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE CATS ADULT COMPLETE CARE 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE CATS ADULT COMPLETE CARE 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "OLD PRINCE CATS ADULT URINARY CARE 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "OLD PRINCE CATS ADULT URINARY CARE 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Super Premium", tamaño: "7.5 KG" },

  // --- Novel Perros (Natural) ---
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ CACHORROS 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "3 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ CACHORROS 7.5 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ CACHORROS 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "15 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ ADULTO SMALL 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "3 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ ADULTO SMALL 7.5 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ ADULTO SMALL 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "15 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ ADULTO M&L 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "15 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ ADULTO LIGHT 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "15 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ ADULTO SENIOR 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "15 KG" },
  { name: "OLD PRINCE NOVEL CERDO Y LEGUMBRES ADULTO 3 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "3 KG" },
  { name: "OLD PRINCE NOVEL CERDO Y LEGUMBRES ADULTO 15 KG", category: "seco-perros", brand: "OLD PRINCE", segmento: "Natural", tamaño: "15 KG" },

  // --- Novel Gatos (Natural) ---
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ CAT KITTEN 1 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "1 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ CAT KITTEN 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "3 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ GATOS ADULTOS 1 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "1 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ GATOS ADULTOS 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "3 KG" },
  { name: "OLD PRINCE NOVEL CORDERO Y ARROZ GATOS ADULTOS 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "OLD PRINCE NOVEL ADULT CAT STERILIZED 1 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "1 KG" },
  { name: "OLD PRINCE NOVEL ADULT CAT STERILIZED 3 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "3 KG" },
  { name: "OLD PRINCE NOVEL ADULT CAT STERILIZED 7.5 KG", category: "seco-gatos", brand: "OLD PRINCE", segmento: "Natural", tamaño: "7.5 KG" },
];

// ---------------------------------------------------------------------------
// Product data — VITALCAN (seco + húmedo)
// ---------------------------------------------------------------------------

const vitalcanSecoProducts: SecoProduct[] = [
  // --- Belcan Perros (Mainstream) ---
  { name: "BELCAN PERRO ADULTO 15 KG", category: "seco-perros", brand: "BELCAN", segmento: "Mainstream", tamaño: "15 KG" },
  { name: "BELCAN PERRO ADULTO 22 KG", category: "seco-perros", brand: "BELCAN", segmento: "Mainstream", tamaño: "22 KG" },
  { name: "BELCAN PERRO JUNIOR 15 KG", category: "seco-perros", brand: "BELCAN", segmento: "Mainstream", tamaño: "15 KG" },

  // --- Belcan Gatos (Mainstream) ---
  { name: "BELCAT GATO ADULTO 10 KG", category: "seco-gatos", brand: "BELCAT", segmento: "Mainstream", tamaño: "10 KG" },

  // --- Complete Perros (Premium) ---
  { name: "COMPLETE PERRO CACHORRO RAZA PEQUEÑA 7.5 KG", category: "seco-perros", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "COMPLETE PERRO CACHORRO RAZA MED/GDE 20 KG", category: "seco-perros", brand: "COMPLETE", segmento: "Premium", tamaño: "20 KG" },
  { name: "COMPLETE PERRO ADULTO RAZA PEQUEÑA 7.5 KG", category: "seco-perros", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "COMPLETE PERRO ADULTO RAZA MED/GDE 20 KG", category: "seco-perros", brand: "COMPLETE", segmento: "Premium", tamaño: "20 KG" },
  { name: "COMPLETE PERRO CONTROL DE PESO 20 KG", category: "seco-perros", brand: "COMPLETE", segmento: "Premium", tamaño: "20 KG" },
  { name: "COMPLETE PERRO SENIOR 20 KG", category: "seco-perros", brand: "COMPLETE", segmento: "Premium", tamaño: "20 KG" },

  // --- Complete Gatos (Premium) ---
  { name: "COMPLETE GATO KITTEN 7.5 KG", category: "seco-gatos", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "COMPLETE GATO ADULTO 7.5 KG", category: "seco-gatos", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "COMPLETE GATO CONTROL PESO/CASTRADO 7.5 KG", category: "seco-gatos", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "COMPLETE GATO URINARY CARE 7.5 KG", category: "seco-gatos", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "COMPLETE GATO SENIOR 7.5 KG", category: "seco-gatos", brand: "COMPLETE", segmento: "Premium", tamaño: "7.5 KG" },

  // --- Balanced Perros (Premium) ---
  { name: "BALANCED PERRO CACHORRO RAZA PEQUEÑA 7.5 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "BALANCED PERRO CACHORRO RAZA MEDIANA 12 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "12 KG" },
  { name: "BALANCED PERRO CACHORRO RAZA GRANDE 20 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "20 KG" },
  { name: "BALANCED PERRO ADULTO RAZA PEQUEÑA 7.5 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "BALANCED PERRO ADULTO RAZA MEDIANA 20 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "20 KG" },
  { name: "BALANCED PERRO ADULTO RAZA GIGANTE 20 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "20 KG" },
  { name: "BALANCED PERRO CONTROL PESO ALL AGES 20 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "20 KG" },
  { name: "BALANCED PERRO SENIOR RAZA GRANDE 15 KG", category: "seco-perros", brand: "BALANCED", segmento: "Premium", tamaño: "15 KG" },

  // --- Balanced Gatos (Premium) ---
  { name: "BALANCED GATO KITTEN 7.5 KG", category: "seco-gatos", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "BALANCED GATO ADULTO 7.5 KG", category: "seco-gatos", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "BALANCED GATO CONTROL PESO/CASTRADO 7.5 KG", category: "seco-gatos", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "BALANCED GATO CONTROL PH ALL AGES 7.5 KG", category: "seco-gatos", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "BALANCED GATO SENIOR 7.5 KG", category: "seco-gatos", brand: "BALANCED", segmento: "Premium", tamaño: "7.5 KG" },

  // --- Natural Recipe Perros (Natural) ---
  { name: "NATURAL RECIPE PERRO ADULTO POLLO 15 KG", category: "seco-perros", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "15 KG" },
  { name: "NATURAL RECIPE PERRO ADULTO CARNE 15 KG", category: "seco-perros", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "15 KG" },
  { name: "NATURAL RECIPE PERRO ADULTO CORDERO 15 KG", category: "seco-perros", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "15 KG" },
  { name: "NATURAL RECIPE PERRO ADULTO SALMON 15 KG", category: "seco-perros", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "15 KG" },
  { name: "NATURAL RECIPE PERRO ADULTO CERDO 15 KG", category: "seco-perros", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "15 KG" },

  // --- Natural Recipe Gatos (Natural) ---
  { name: "NATURAL RECIPE GATO ADULTO POLLO 7.5 KG", category: "seco-gatos", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "NATURAL RECIPE GATO ADULTO SALMON 7.5 KG", category: "seco-gatos", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "NATURAL RECIPE GATO ADULTO CORDERO 7.5 KG", category: "seco-gatos", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "NATURAL RECIPE GATO ADULTO TRUCHA 7.5 KG", category: "seco-gatos", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "7.5 KG" },
  { name: "NATURAL RECIPE GATO ADULTO MERLUZA 7.5 KG", category: "seco-gatos", brand: "NATURAL RECIPE", segmento: "Natural", tamaño: "7.5 KG" },

  // --- Nutrique Perros (Super Premium) ---
  { name: "NUTRIQUE TOY Y MINI PUPPY 3 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "NUTRIQUE MEDIUM PUPPY 12 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "12 KG" },
  { name: "NUTRIQUE LARGE PUPPY 15 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "NUTRIQUE MEDIUM YOUNG ADULT 12 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "12 KG" },
  { name: "NUTRIQUE LARGE ADULT +6 15 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "NUTRIQUE HEALTHY WEIGHT 15 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "NUTRIQUE SKIN SENSITIVITY 15 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "NUTRIQUE MOTHER Y BABY 12 KG", category: "seco-perros", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "12 KG" },

  // --- Nutrique Gatos (Super Premium) ---
  { name: "NUTRIQUE BABY CAT Y KITTEN 7.5 KG", category: "seco-gatos", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "NUTRIQUE YOUNG ADULT CAT 7.5 KG", category: "seco-gatos", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "NUTRIQUE ADULT 7+ CAT 7.5 KG", category: "seco-gatos", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "NUTRIQUE STERILISED/HEALTHY WEIGHT CAT 7.5 KG", category: "seco-gatos", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "NUTRIQUE URINARY CARE CAT 7.5 KG", category: "seco-gatos", brand: "NUTRIQUE", segmento: "Super Premium", tamaño: "7.5 KG" },

  // --- Therapy Perros (Prescripción Médica) ---
  { name: "THERAPY CANINE GASTROINTESTINAL 10 KG", category: "seco-perros", brand: "THERAPY", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "THERAPY CANINE HYPOALLERGENIC 10 KG", category: "seco-perros", brand: "THERAPY", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "THERAPY CANINE RENAL CARE 10 KG", category: "seco-perros", brand: "THERAPY", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "THERAPY CANINE MOBILITY AID 15 KG", category: "seco-perros", brand: "THERAPY", segmento: "Prescripción Médica", tamaño: "15 KG" },
  { name: "THERAPY CANINE OBESITY MGMT 15 KG", category: "seco-perros", brand: "THERAPY", segmento: "Prescripción Médica", tamaño: "15 KG" },

  // --- Therapy Gatos (Prescripción Médica) ---
  { name: "THERAPY FELINE URINARY HEALTH 7.5 KG", category: "seco-gatos", brand: "THERAPY", segmento: "Prescripción Médica", tamaño: "7.5 KG" },
];

const vitalcanHumedoProducts: HumedoProduct[] = [
  // --- Natural Recipe Húmedos Perros (Natural) ---
  { name: "NATURAL RECIPE POUCH PERRO ADULTO CORDERO", category: "humedo-perros", brand: "NATURAL RECIPE", sabor: "CORDERO", formato: "POUCH 100G X12" },
  { name: "NATURAL RECIPE LATA PERRO ADULTO CARNE", category: "humedo-perros", brand: "NATURAL RECIPE", sabor: "CARNE", formato: "LATA 340G X12" },

  // --- Natural Recipe Húmedos Gatos (Natural) ---
  { name: "NATURAL RECIPE POUCH GATO ADULTO POLLO", category: "humedo-gatos", brand: "NATURAL RECIPE", sabor: "POLLO", formato: "POUCH 85G X12" },
  { name: "NATURAL RECIPE SOFT CREAM GATO POLLO", category: "humedo-gatos", brand: "NATURAL RECIPE", sabor: "POLLO", formato: "POUCH 56G X12" },

  // --- Soufflé / Complete en Salsa (Mainstream) ---
  { name: "SOUFFLE PERRO ADULTO CARNE", category: "humedo-perros", brand: "SOUFFLE", sabor: "CARNE", formato: "LATA 340G" },
  { name: "SOUFFLE GATO ADULTO POLLO", category: "humedo-gatos", brand: "SOUFFLE", sabor: "POLLO", formato: "POUCH 85G" },
  { name: "COMPLETE EN SALSA PERRO ADULTO CARNE", category: "humedo-perros", brand: "COMPLETE", sabor: "CARNE", formato: "LATA 340G" },
  { name: "COMPLETE EN SALSA GATO ADULTO POLLO", category: "humedo-gatos", brand: "COMPLETE", sabor: "POLLO", formato: "LATA 340G" },
  { name: "COMPLETE POUCH PERRO ADULTO CARNE", category: "humedo-perros", brand: "COMPLETE", sabor: "CARNE", formato: "POUCH 100G X12" },
];

// ---------------------------------------------------------------------------
// Product data — EUKANUBA (seco only)
// ---------------------------------------------------------------------------

const eukanubaProducts: SecoProduct[] = [
  // --- Perros (Premium) ---
  { name: "EUKANUBA PUPPY SMALL BREED 1 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "1 KG" },
  { name: "EUKANUBA PUPPY SMALL BREED 3 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "3 KG" },
  { name: "EUKANUBA PUPPY SMALL BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA PUPPY MEDIUM BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA PUPPY LARGE BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA ADULT SMALL BREED 7.5 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "EUKANUBA ADULT SMALL BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA ADULT MEDIUM BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA ADULT LARGE BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA SENIOR SMALL BREED 3 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "3 KG" },
  { name: "EUKANUBA SENIOR LARGE BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA FIT BODY SMALL BREED 3 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "3 KG" },
  { name: "EUKANUBA FIT BODY MEDIUM BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA FIT BODY LARGE BREED 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA PUPPY LAMB 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
  { name: "EUKANUBA ADULT LAMB 15 KG", category: "seco-perros", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },

  // --- Gatos (Premium) ---
  { name: "EUKANUBA KITTEN HEALTHY START 1 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "1 KG" },
  { name: "EUKANUBA KITTEN HEALTHY START 3 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "3 KG" },
  { name: "EUKANUBA KITTEN HEALTHY START 7.5 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "EUKANUBA GATO ADULTO TOP CONDITION 1.5 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "1.5 KG" },
  { name: "EUKANUBA GATO ADULTO TOP CONDITION 3 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "3 KG" },
  { name: "EUKANUBA GATO ADULTO TOP CONDITION 7.5 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "7.5 KG" },
  { name: "EUKANUBA GATO ADULTO TOP CONDITION 15 KG", category: "seco-gatos", brand: "EUKANUBA", segmento: "Premium", tamaño: "15 KG" },
];

// ---------------------------------------------------------------------------
// Product data — ROYAL CANIN (seco only)
// ---------------------------------------------------------------------------

const royalCaninProducts: SecoProduct[] = [
  // --- Size Health Perros (Super Premium) ---
  { name: "ROYAL CANIN X-SMALL PUPPY 1 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "1 KG" },
  { name: "ROYAL CANIN X-SMALL ADULTO 1 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "1 KG" },
  { name: "ROYAL CANIN MINI PUPPY 7.5 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN MINI PUPPY 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MINI ADULT 7.5 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN MINI ADULT 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MINI ADULT 8+ 3 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "ROYAL CANIN MINI AGEING 12+ 3 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "ROYAL CANIN MEDIUM PUPPY 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MEDIUM ADULT 7.5 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN MEDIUM ADULT 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MEDIUM ADULT 7+ 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MAXI PUPPY 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MAXI ADULT 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN MAXI ADULT 5+ 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN GIANT PUPPY 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN GIANT ADULT 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },

  // --- Health Nutrition Gatos (Super Premium) ---
  { name: "ROYAL CANIN MOTHER Y BABYCAT 1.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "1.5 KG" },
  { name: "ROYAL CANIN KITTEN 7.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN KITTEN 15 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "15 KG" },
  { name: "ROYAL CANIN INDOOR 7.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN FIT 1.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "1.5 KG" },
  { name: "ROYAL CANIN FIT 3 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "3 KG" },
  { name: "ROYAL CANIN SENSIBLE 7.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN AGEING +11 2 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Super Premium", tamaño: "2 KG" },

  // --- Veterinary Canine (Prescripción Médica) ---
  { name: "ROYAL CANIN URINARY SO CANINE 10 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "ROYAL CANIN SATIETY CANINE 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Prescripción Médica", tamaño: "15 KG" },
  { name: "ROYAL CANIN HYPOALLERGENIC CANINE 10 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "ROYAL CANIN GASTROINTESTINAL CANINE 10 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "ROYAL CANIN RENAL CANINE 10 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Prescripción Médica", tamaño: "10 KG" },
  { name: "ROYAL CANIN MOBILITY CANINE 10 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Prescripción Médica", tamaño: "10 KG" },

  // --- Club Performance (Mainstream) ---
  { name: "ROYAL CANIN CLUB PERFORMANCE DOG JUNIOR 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Mainstream", tamaño: "15 KG" },
  { name: "ROYAL CANIN CLUB PERFORMANCE DOG ADULTO 15 KG", category: "seco-perros", brand: "ROYAL CANIN", segmento: "Mainstream", tamaño: "15 KG" },
  { name: "ROYAL CANIN CLUB PERFORMANCE CAT KITTEN 7.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Mainstream", tamaño: "7.5 KG" },
  { name: "ROYAL CANIN CLUB PERFORMANCE CAT 7.5 KG", category: "seco-gatos", brand: "ROYAL CANIN", segmento: "Mainstream", tamaño: "7.5 KG" },
];

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

const CATEGORY_KEYS = ["seco-perros", "seco-gatos", "humedo-perros", "humedo-gatos"] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

const CATEGORY_PATHS: Record<CategoryKey, { parent: string; child: string }> = {
  "seco-perros": { parent: "Alimento Seco (Balanceado)", child: "Perros" },
  "seco-gatos": { parent: "Alimento Seco (Balanceado)", child: "Gatos" },
  "humedo-perros": { parent: "Alimento Húmedo (Latas / Sobres)", child: "Perros" },
  "humedo-gatos": { parent: "Alimento Húmedo (Pouch / Latas)", child: "Gatos" },
};

const SECO_VARIANT_NAMES = ["Marca", "Etapa", "Segmento", "Tamaño"];
const HUMEDO_VARIANT_NAMES = ["Marca", "Sabor", "Formato"];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Connecting to database...");
  await basePrisma.$connect();

  const ORG_SLUG = "el-almacen-de-las-mascotas";

  // 1. Find organization
  const org = await basePrisma.organization.findFirst({
    where: { slug: ORG_SLUG },
  });
  if (!org) {
    console.error(`Organization with slug "${ORG_SLUG}" not found.`);
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`Organization: ${org.name} (${orgId})`);

  // 2. Find categories
  const categoryIds: Record<CategoryKey, string> = {} as any;
  const parentCache: Record<string, string> = {};

  for (const key of CATEGORY_KEYS) {
    const { parent, child } = CATEGORY_PATHS[key];

    if (!parentCache[parent]) {
      const p = await basePrisma.category.findFirst({
        where: { name: parent, organizationId: orgId, parentId: null },
      });
      if (!p) throw new Error(`Parent category not found: "${parent}"`);
      parentCache[parent] = p.id;
    }

    const c = await basePrisma.category.findFirst({
      where: { name: child, organizationId: orgId, parentId: parentCache[parent] },
    });
    if (!c) throw new Error(`Child category not found: "${parent} > ${child}"`);
    categoryIds[key] = c.id;
    console.log(`Category ${key}: ${parent} > ${child} (${c.id})`);
  }

  // 3. Find variant definitions for each category
  type VariantDefMap = Record<string, string>; // name → id

  const secoVariantDefs: Record<CategoryKey, VariantDefMap> = {} as any;
  const humedoVariantDefs: Record<CategoryKey, VariantDefMap> = {} as any;

  for (const key of CATEGORY_KEYS) {
    const catId = categoryIds[key];
    const isSeco = key.startsWith("seco-");
    const vdNames = isSeco ? SECO_VARIANT_NAMES : HUMEDO_VARIANT_NAMES;

    for (const vdName of vdNames) {
      let vd = await basePrisma.categoryVariantDefinition.findFirst({
        where: { categoryId: catId, name: vdName, organizationId: orgId },
      });
      if (!vd) {
        console.log(`  Creating variant definition "${vdName}" for category ${key}...`);
        vd = await basePrisma.categoryVariantDefinition.create({
          data: { categoryId: catId, name: vdName, organizationId: orgId },
        });
      }
      if (isSeco) {
        if (!secoVariantDefs[key]) secoVariantDefs[key] = {};
        secoVariantDefs[key][vdName] = vd.id;
      } else {
        if (!humedoVariantDefs[key]) humedoVariantDefs[key] = {};
        humedoVariantDefs[key][vdName] = vd.id;
      }
    }
    console.log(
      `  ${key} variant defs: ${Object.keys(isSeco ? secoVariantDefs[key] : humedoVariantDefs[key]).join(", ")}`,
    );
  }

  // 4. Helper: find or create variant option
  async function findOrCreateOption(variantDefId: string, value: string): Promise<string> {
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

  // 5. Helper: create one seco product
  async function createSecoProduct(p: SecoProduct): Promise<void> {
    const catId = categoryIds[p.category];
    const vds = secoVariantDefs[p.category];
    const etapa = deriveEtapa(p.name);

    const [marcaOptId, etapaOptId, segOptId, tamOptId] = await Promise.all([
      findOrCreateOption(vds["Marca"], p.brand),
      etapa ? findOrCreateOption(vds["Etapa"], etapa) : Promise.resolve(null),
      findOrCreateOption(vds["Segmento"], p.segmento),
      findOrCreateOption(vds["Tamaño"], p.tamaño),
    ]);

    const product = await basePrisma.product.create({
      data: {
        name: p.name,
        price: p.price ?? 0,
        quantity: 0,
        categoryId: catId,
        organizationId: orgId,
        code: shortCode(p.name),
      },
    });

    const variantIds = [marcaOptId, segOptId, tamOptId];
    if (etapaOptId) variantIds.push(etapaOptId);

    await basePrisma.productVariant.createMany({
      data: variantIds.map((oid) => ({
        productId: product.id,
        optionId: oid,
        organizationId: orgId,
      })),
    });
  }

  // 6. Helper: create one húmedo product
  async function createHumedoProduct(p: HumedoProduct): Promise<void> {
    const catId = categoryIds[p.category];
    const vds = humedoVariantDefs[p.category];

    const [marcaOptId, saborOptId, fmtOptId] = await Promise.all([
      findOrCreateOption(vds["Marca"], p.brand),
      findOrCreateOption(vds["Sabor"], p.sabor),
      findOrCreateOption(vds["Formato"], p.formato),
    ]);

    const product = await basePrisma.product.create({
      data: {
        name: p.name,
        price: p.price ?? 0,
        quantity: 0,
        categoryId: catId,
        organizationId: orgId,
        code: shortCode(p.name),
      },
    });

    await basePrisma.productVariant.createMany({
      data: [marcaOptId, saborOptId, fmtOptId].map((oid) => ({
        productId: product.id,
        optionId: oid,
        organizationId: orgId,
      })),
    });
  }

  // 7. Load all products
  let created = 0;
  let errors = 0;

  console.log(`\n--- OLD PRINCE (${oldPrinceProducts.length} seco) ---`);
  for (const p of oldPrinceProducts) {
    try {
      await createSecoProduct(p);
      created++;
    } catch (e: any) {
      console.error(`  ERROR: ${p.name} — ${e.message}`);
      errors++;
    }
  }
  console.log(`  Done: ${created} created, ${errors} errors`);

  const oldErrors = errors;
  errors = 0;
  console.log(`\n--- VITALCAN (${vitalcanSecoProducts.length} seco + ${vitalcanHumedoProducts.length} húmedo) ---`);
  for (const p of vitalcanSecoProducts) {
    try {
      await createSecoProduct(p);
      created++;
    } catch (e: any) {
      console.error(`  ERROR: ${p.name} — ${e.message}`);
      errors++;
    }
  }
  for (const p of vitalcanHumedoProducts) {
    try {
      await createHumedoProduct(p);
      created++;
    } catch (e: any) {
      console.error(`  ERROR: ${p.name} — ${e.message}`);
      errors++;
    }
  }
  console.log(`  Done: ${created} total, ${oldErrors + errors} errors`);

  errors = 0;
  console.log(`\n--- EUKANUBA (${eukanubaProducts.length} seco) ---`);
  for (const p of eukanubaProducts) {
    try {
      await createSecoProduct(p);
      created++;
    } catch (e: any) {
      console.error(`  ERROR: ${p.name} — ${e.message}`);
      errors++;
    }
  }
  console.log(`  Done: ${created} total, ${oldErrors + errors} errors`);

  errors = 0;
  console.log(`\n--- ROYAL CANIN (${royalCaninProducts.length} seco) ---`);
  for (const p of royalCaninProducts) {
    try {
      await createSecoProduct(p);
      created++;
    } catch (e: any) {
      console.error(`  ERROR: ${p.name} — ${e.message}`);
      errors++;
    }
  }
  console.log(`  Done: ${created} total, ${oldErrors + errors} errors`);

  console.log(`\n=== FINISHED: ${created} products created, ${oldErrors + errors} errors ===`);
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });
