import type { LooseStockLine } from "@/services/looseStock";
import type { PriceKgPrice } from "@/services/priceKgPlan";

interface Named {
  id: string;
  name: string;
}

interface BuildParams {
  plan: PriceKgPrice[];
  brands: Named[];
  types: Named[];
  lines: LooseStockLine[];
  /** Selected branch id, or "" when all branches are shown. */
  branchId: string;
  branchName: string;
}

/**
 * Merges the price-per-kg plan with the existing LooseStock rows so every plan
 * cell is listed, even when it has no stock row yet (shown with 0 kg).
 * With a branch selected a missing cell gets a row for that branch; with all
 * branches shown it gets a single row without branch (the save needs one).
 */
export const buildLooseStockRows = ({
  plan,
  brands,
  types,
  lines,
  branchId,
  branchName,
}: BuildParams): LooseStockLine[] => {
  const brandById = new Map(brands.map((b) => [b.id, b.name]));
  const typeById = new Map(types.map((t) => [t.id, t.name]));

  const covered = new Set(
    lines
      .filter((l) => !branchId || l.branchId === branchId)
      .map((l) => l.priceKgPriceId),
  );

  const missing: LooseStockLine[] = plan
    .filter((cell) => !covered.has(cell.id))
    .map((cell) => ({
      id: null,
      priceKgPriceId: cell.id,
      branchId,
      branchName: branchName || null,
      quantity: 0,
      brandId: cell.brandId,
      typeId: cell.typeId,
      species: cell.species,
      priceKg: cell.priceKg,
      lineName: [brandById.get(cell.brandId), typeById.get(cell.typeId)]
        .filter(Boolean)
        .join(" · "),
    }));

  return [...lines, ...missing].sort(
    (a, b) =>
      b.quantity - a.quantity ||
      (a.lineName ?? "").localeCompare(b.lineName ?? "", "es"),
  );
};
