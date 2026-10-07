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
  branches: Named[];
}

/**
 * Merges the price-per-kg plan with the existing LooseStock rows so every plan
 * cell is listed per branch, even when it has no stock row yet (shown with
 * 0 kg). With a branch selected only that branch is expanded; with all
 * branches shown every cell x branch combination is listed.
 */
export const buildLooseStockRows = ({
  plan,
  brands,
  types,
  lines,
  branchId,
  branches,
}: BuildParams): LooseStockLine[] => {
  const brandById = new Map(brands.map((b) => [b.id, b.name]));
  const typeById = new Map(types.map((t) => [t.id, t.name]));
  const targetBranches = branchId
    ? branches.filter((b) => b.id === branchId)
    : branches;

  const existing = new Set(lines.map((l) => `${l.priceKgPriceId}|${l.branchId}`));

  const missing: LooseStockLine[] = [];
  for (const cell of plan) {
    for (const branch of targetBranches) {
      if (existing.has(`${cell.id}|${branch.id}`)) continue;
      missing.push({
        id: null,
        priceKgPriceId: cell.id,
        branchId: branch.id,
        branchName: branch.name,
        quantity: 0,
        brandId: cell.brandId,
        typeId: cell.typeId,
        species: cell.species,
        priceKg: cell.priceKg,
        lineName: [brandById.get(cell.brandId), typeById.get(cell.typeId)]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  return [...lines, ...missing].sort(
    (a, b) =>
      b.quantity - a.quantity ||
      (a.lineName ?? "").localeCompare(b.lineName ?? "", "es") ||
      (a.branchName ?? "").localeCompare(b.branchName ?? "", "es"),
  );
};
