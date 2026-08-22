// Helper PURO de cálculo fiscal ARCA (sdd/arca-facturacion-electronica).
// Separado del service a propósito (mismo criterio que invoiceCalc): es
// lógica fiscal crítica y necesita testearse aislada, sin mockear DB ni
// Express. Regla de centavos: TODO se calcula en centavos enteros — nunca
// Float en el payload ARCA. Serialización: (cents / 100).toFixed(2).

export interface ArcaLineInput {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

/** Desglose por alícuota para el array Iva/AlicIva de FECAEDetRequest. */
export interface ArcaAlicuota {
  tasa: number;
  baseImpCents: number;
  importeCents: number;
}

export interface ArcaAmounts {
  netoCents: number; // gravadas (alícuota > 0)
  ivaCents: number;
  exentoCents: number; // alícuota 0 → ImpOpEx (operaciones exentas)
  totalCents: number;
  porAlicuota: ArcaAlicuota[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Calcula neto/IVA/exento/total en CENTAVOS ENTEROS desde las líneas de la
 * factura. neto línea = round2(qty × unitPrice) (consistente con el flujo
 * interno) → Math.round(x × 100). IVA por alícuota = Math.round(netoCents ×
 * tasa / 100). Total = neto + exento + iva → cuadratura exacta (21%, exento,
 * mixto). Las líneas con tasa 0 van a exento (ImpOpEx) y NO generan AlicIva.
 */
export const calcArcaAmounts = (items: ArcaLineInput[]): ArcaAmounts => {
  const porAlicuota = new Map<number, ArcaAlicuota>();
  let netoCents = 0;
  let exentoCents = 0;

  for (const item of items) {
    const netoLineaCents = Math.round(round2(item.quantity * item.unitPrice) * 100);

    if (item.taxRate === 0) {
      exentoCents += netoLineaCents;
      continue;
    }

    netoCents += netoLineaCents;
    const ivaLineaCents = Math.round((netoLineaCents * item.taxRate) / 100);

    const acumulado = porAlicuota.get(item.taxRate) ?? {
      tasa: item.taxRate,
      baseImpCents: 0,
      importeCents: 0,
    };
    acumulado.baseImpCents += netoLineaCents;
    acumulado.importeCents += ivaLineaCents;
    porAlicuota.set(item.taxRate, acumulado);
  }

  const ivaCents = Array.from(porAlicuota.values()).reduce(
    (acc, a) => acc + a.importeCents,
    0,
  );
  const totalCents = netoCents + exentoCents + ivaCents;

  return {
    netoCents,
    ivaCents,
    exentoCents,
    totalCents,
    porAlicuota: Array.from(porAlicuota.values()),
  };
};

/** Deja SOLO los dígitos: "30-70970670-1" → "30709706701". */
export const normalizeCuit = (input: string): string =>
  input.replace(/\D/g, "");

/**
 * Valida un CUIT (11 dígitos + DV mod 11). Pesos: 5,4,3,2,7,6,5,4,3,2 sobre
 * los 10 primeros dígitos; DV = (11 − (sum mod 11)) mod 11; DV = 10 no existe.
 */
export const isValidCuit = (cuit: string): boolean => {
  const digits = normalizeCuit(cuit);
  if (!/^\d{11}$/.test(digits)) {
    return false;
  }

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce(
    (acc, weight, i) => acc + Number(digits[i]) * weight,
    0,
  );
  const dv = (11 - (sum % 11)) % 11;
  if (dv === 10) {
    return false;
  }
  return dv === Number(digits[10]);
};

/** Id de alícuota ARCA (AlicIva.Id) para una tasa conocida. */
export const mapAlicuotaId = (tasa: number): number => {
  const MAP: Record<number, number> = {
    0: 3, // 0% (solo como AlicIva si aplicara; normalmente va a ImpOpEx)
    2.5: 8,
    5: 7,
    10.5: 4,
    21: 5,
    27: 6,
  };
  const id = MAP[tasa];
  if (id === undefined) {
    throw new Error(`Alícuota no soportada por ARCA: ${tasa}%`);
  }
  return id;
};

export interface ReceptorFiscal {
  docTipo: number; // 80=CUIT, 96=DNI, 99=Consumidor Final
  docNro: string; // "0" consumidor final; hasta 20 dígitos
  condicionIvaReceptorId: number; // 1=RI, 5=Consumidor Final, 6=Monotributo
}

/**
 * Mapea la condición IVA en texto libre del cliente al ID de ARCA
 * (RG 5616: 1=RI, 4=Exento, 5=Consumidor Final, 6=Monotributista).
 *
 * La condición IVA del cliente se carga como texto libre en el front (ej.
 * "IVA Responsable Inscripto", "Monotributo"). Este helper lo normaliza de
 * forma tolerante (mayúsculas, acentos, "inscripto/inscripta") y cae al
 * default seguro (5 = Consumidor Final) cuando no hay dato o no se reconoce.
 */
export const mapCondicionIvaId = (
  condicion?: string | null,
): number => {
  const s = (condicion ?? "").trim().toLowerCase();
  if (!s) return 5; // consumidor final (default seguro)

  const unaccent = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Responsable Inscripto (1)
  if (/responsable inscrip/.test(unaccent)) return 1;
  // Monotributista (6)
  if (/monotribut/.test(unaccent)) return 6;
  // Exento / No alcanzado (4)
  if (/exent|no alcanzad|no inscript/.test(unaccent)) return 4;
  // Consumidor Final (5)
  if (/consumidor final|final/.test(unaccent)) return 5;

  return 5; // default seguro
};

export type DeriveReceptorResult =
  | { ok: true; receptor: ReceptorFiscal }
  | { ok: false; error: "CUIT_INVALIDO" };

/**
 * Deriva el receptor fiscal del comprobante (design D5, paso 3):
 * - sin taxId → Factura B consumidor final (99 / "0" / condIva 5)
 * - CUIT válido (11 dígitos + DV) → Factura A (80 / CUIT / condIva 1)
 * - DNI (7-8 dígitos) → Factura B identificada (96 / DNI / condIva según el
 *   cliente: RI=1, Monotributo=6, Exento=4, default CF=5) — antes estaba
 *   clavado en 5 (deuda técnica item 3).
 * - CUIT con DV incorrecto o formato irreconocible → CUIT_INVALIDO (spec 5.4:
 *   el error NO avanza la emisión fiscal).
 */
export const deriveReceptorFiscal = (
  taxId?: string | null,
  condicionIva?: string | null,
): DeriveReceptorResult => {
  const digits = taxId ? normalizeCuit(taxId) : "";

  if (digits.length === 0) {
    return {
      ok: true,
      receptor: { docTipo: 99, docNro: "0", condicionIvaReceptorId: 5 },
    };
  }

  if (digits.length === 11) {
    if (!isValidCuit(digits)) {
      return { ok: false, error: "CUIT_INVALIDO" };
    }
    return {
      ok: true,
      receptor: { docTipo: 80, docNro: digits, condicionIvaReceptorId: 1 },
    };
  }

  if (digits.length >= 7 && digits.length <= 8) {
    return {
      ok: true,
      receptor: {
        docTipo: 96,
        docNro: digits,
        condicionIvaReceptorId: mapCondicionIvaId(condicionIva),
      },
    };
  }

  return { ok: false, error: "CUIT_INVALIDO" };
};