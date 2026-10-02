import { summarizeBalances } from "../../src/utils/balancesSummary";

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

  it("splits debtors (balance > 0) from creditors (balance < 0) and ignores zeros", () => {
    const s = summarizeBalances([
      b("1", "Ana", 100.1),
      b("2", "Beto", 50.2),
      b("3", "Carla", -30.05),
      b("4", "Dani", 0),
    ]);
    expect(s.totalOwed).toBe(150.3);
    expect(s.totalCredit).toBe(30.05);
    expect(s.net).toBe(120.25);
    expect(s.debtorCount).toBe(2);
    expect(s.creditorCount).toBe(1);
  });

  it("orders top debtors by balance desc, ties by name, max 5, with share of totalOwed", () => {
    const s = summarizeBalances([
      b("1", "Zeta", 100),
      b("2", "Alfa", 100),
      b("3", "Mid", 300),
      b("4", "Low1", 10),
      b("5", "Low2", 20),
      b("6", "Low3", 5),
    ]);
    expect(s.topDebtors.map((d) => d.name)).toEqual(["Mid", "Alfa", "Zeta", "Low2", "Low1"]);
    expect(s.topDebtors[0]).toEqual({ customerId: "3", name: "Mid", balance: 300, share: 300 / 535 });
  });

  it("gives no top debtors when only creditors exist", () => {
    const s = summarizeBalances([b("1", "Ana", -10)]);
    expect(s.topDebtors).toEqual([]);
    expect(s.net).toBe(-10);
  });
});
