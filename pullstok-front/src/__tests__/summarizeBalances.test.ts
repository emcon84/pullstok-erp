import { describe, it, expect } from "vitest";
import { summarizeBalances } from "../utils/summarizeBalances";

const b = (customerId: string, name: string, balance: number) => ({ customerId, name, balance });

describe("summarizeBalances", () => {
  it("returns zeros for an empty list", () => {
    expect(summarizeBalances([])).toEqual({
      totalOwed: 0,
      totalCredit: 0,
      net: 0,
      debtorCount: 0,
      creditorCount: 0,
      topDebtors: [],
    });
  });

  it("splits mixed signs into owed, credit and net", () => {
    const s = summarizeBalances([b("1", "A", 100), b("2", "B", -30), b("3", "C", 50)]);
    expect(s.totalOwed).toBe(150);
    expect(s.totalCredit).toBe(30);
    expect(s.net).toBe(120);
    expect(s.debtorCount).toBe(2);
    expect(s.creditorCount).toBe(1);
  });

  it("rounds sums to 2 decimals", () => {
    const s = summarizeBalances([b("1", "A", 0.1), b("2", "B", 0.2), b("3", "C", -0.1)]);
    expect(s.totalOwed).toBe(0.3);
    expect(s.net).toBe(0.2);
  });

  it("ignores zero balances", () => {
    const s = summarizeBalances([b("1", "A", 0)]);
    expect(s.debtorCount).toBe(0);
    expect(s.creditorCount).toBe(0);
  });

  it("ranks the top 5 debtors desc with share of total debt", () => {
    const list = [10, 20, 30, 40, 50, 60, 70].map((n, i) => b(String(i), `C${i}`, n));
    const s = summarizeBalances(list.concat(b("x", "Cred", -999)));
    expect(s.topDebtors.map((d) => d.balance)).toEqual([70, 60, 50, 40, 30]);
    expect(s.topDebtors[0].share).toBeCloseTo(70 / 280);
  });

  it("breaks ties by name for a stable order", () => {
    const s = summarizeBalances([b("1", "Zeta", 10), b("2", "Ana", 10)]);
    expect(s.topDebtors.map((d) => d.name)).toEqual(["Ana", "Zeta"]);
  });
});
