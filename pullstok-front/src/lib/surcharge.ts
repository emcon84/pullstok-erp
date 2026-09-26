import { round2 } from "@/lib/money";
import type { PaymentInput } from "@/models/cashSessionModel";

/**
 * Credit card surcharge — frontend mirror of the server rule (the server is the
 * authority; this only feeds the payment modal and the ticket).
 *
 * The surcharge applies ONLY to TARJETA_CREDITO rows and is rounded PER ROW:
 * surcharge = Σ round2(round2(amount) × pct / 100). Entered payment amounts are
 * BASE amounts (before surcharge).
 */

/** Surcharge % bounds, same as the discount %. */
export const clampSurchargePct = (n: number | undefined): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
};

const rowSurcharge = (p: PaymentInput, pct: number): number =>
  p.method === "TARJETA_CREDITO" ? round2((round2(p.amount) * pct) / 100) : 0;

/** Total surcharge over the card rows of `payments` (0 without card rows). */
export function computeSurcharge(
  payments: PaymentInput[] | undefined,
  pct: number | undefined,
): number {
  const safePct = clampSurchargePct(pct);
  if (!payments || safePct === 0) return 0;
  return round2(payments.reduce((s, p) => s + rowSurcharge(p, safePct), 0));
}

/** Payments as actually charged: each card row = base + its own surcharge. */
export function applySurchargeToPayments(
  payments: PaymentInput[],
  pct: number | undefined,
): PaymentInput[] {
  const safePct = clampSurchargePct(pct);
  if (safePct === 0) return payments;
  return payments.map((p) => ({ ...p, amount: round2(p.amount + rowSurcharge(p, safePct)) }));
}
