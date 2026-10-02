import { round2 } from "@/lib/money";
import type { CustomerBalance } from "../models/customerAccountModel";

export interface TopDebtor extends CustomerBalance {
  /** Fraction (0..1) of the total debt owed by this customer. */
  share: number;
}

export interface BalancesSummary {
  /** Sum of positive balances (money customers owe us). */
  totalOwed: number;
  /** Absolute sum of negative balances (credit in customers' favor). */
  totalCredit: number;
  /** totalOwed - totalCredit. */
  net: number;
  debtorCount: number;
  creditorCount: number;
  topDebtors: TopDebtor[];
}

const TOP_N = 5;

/** Aggregates the per-customer balances into company-wide account totals. */
export const summarizeBalances = (balances: CustomerBalance[]): BalancesSummary => {
  const debtors = balances.filter((b) => b.balance > 0);
  const creditors = balances.filter((b) => b.balance < 0);

  const rawOwed = debtors.reduce((acc, b) => acc + b.balance, 0);
  const totalOwed = round2(rawOwed);
  const totalCredit = round2(creditors.reduce((acc, b) => acc + Math.abs(b.balance), 0));

  const topDebtors = [...debtors]
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "es"))
    .slice(0, TOP_N)
    .map((d) => ({ ...d, share: rawOwed > 0 ? d.balance / rawOwed : 0 }));

  return {
    totalOwed,
    totalCredit,
    net: round2(totalOwed - totalCredit),
    debtorCount: debtors.length,
    creditorCount: creditors.length,
    topDebtors,
  };
};
