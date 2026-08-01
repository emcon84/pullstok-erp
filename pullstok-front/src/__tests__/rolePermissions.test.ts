import { describe, it, expect } from "vitest";
import {
  canEditBranchStock,
  resolveScannerBranchMode,
  STOCK_EDIT_ROLES,
} from "../constants/rolePermissions";

/**
 * Client-side stock-edit policy (spec A2 / design D5): mirrors the backend
 * stockService.canEditBranchStock. ADMIN/MANAGEMENT edit any branch;
 * VENDEDOR/CASHIER only their assigned branches; everyone else never edits.
 */
describe("canEditBranchStock", () => {
  it("returns true for ADMIN on any branch, even without assignments", () => {
    expect(canEditBranchStock("ADMIN", [], "b1")).toBe(true);
    expect(canEditBranchStock("ADMIN", null, "b1")).toBe(true);
    expect(canEditBranchStock("ADMIN", undefined, "b1")).toBe(true);
  });

  it("returns true for MANAGEMENT on any branch", () => {
    expect(canEditBranchStock("MANAGEMENT", ["b1"], "b2")).toBe(true);
  });

  it("returns true for VENDEDOR assigned to the target branch", () => {
    expect(canEditBranchStock("VENDEDOR", ["b1", "b2"], "b1")).toBe(true);
  });

  it("returns false for VENDEDOR on a branch it is not assigned to", () => {
    expect(canEditBranchStock("VENDEDOR", ["b1"], "b2")).toBe(false);
  });

  it("returns false for VENDEDOR without assignments (read-only)", () => {
    expect(canEditBranchStock("VENDEDOR", [], "b1")).toBe(false);
    expect(canEditBranchStock("VENDEDOR", null, "b1")).toBe(false);
    expect(canEditBranchStock("VENDEDOR", undefined, "b1")).toBe(false);
  });

  it("returns true for CASHIER assigned to the target branch", () => {
    expect(canEditBranchStock("CASHIER", ["b9"], "b9")).toBe(true);
  });

  it("returns false for CASHIER on an unassigned branch", () => {
    expect(canEditBranchStock("CASHIER", ["b9"], "b10")).toBe(false);
  });

  it("returns false for EMPLOYEE even with assignments", () => {
    expect(canEditBranchStock("EMPLOYEE", ["b1"], "b1")).toBe(false);
  });

  it("returns false for SUPERADMIN (mirrors the backend policy)", () => {
    expect(canEditBranchStock("SUPERADMIN", ["b1"], "b1")).toBe(false);
  });

  it("returns false for unknown or missing roles", () => {
    expect(canEditBranchStock("CUSTOM", ["b1"], "b1")).toBe(false);
    expect(canEditBranchStock(null, ["b1"], "b1")).toBe(false);
    expect(canEditBranchStock(undefined, ["b1"], "b1")).toBe(false);
  });

  it("exposes STOCK_EDIT_ROLES as exactly ADMIN and MANAGEMENT", () => {
    expect(STOCK_EDIT_ROLES).toContain("ADMIN");
    expect(STOCK_EDIT_ROLES).toContain("MANAGEMENT");
    expect(STOCK_EDIT_ROLES).toHaveLength(2);
  });
});

/**
 * Scanner branch resolution (spec F2): maps the logged user to the branch the
 * scanner adjusts. ADMIN/MANAGEMENT choose among all branches; a VENDEDOR/
 * CASHIER with exactly one assignment is pinned to it; with several, they pick
 * among their own; with none (or any other role) the scanner is read-only.
 */
describe("resolveScannerBranchMode", () => {
  it("gives ADMIN a selector over all branches, regardless of assignments", () => {
    expect(resolveScannerBranchMode("ADMIN", ["b1"])).toEqual({ kind: "selector" });
    expect(resolveScannerBranchMode("ADMIN", [])).toEqual({ kind: "selector" });
    expect(resolveScannerBranchMode("ADMIN", undefined)).toEqual({ kind: "selector" });
  });

  it("gives MANAGEMENT a selector over all branches", () => {
    expect(resolveScannerBranchMode("MANAGEMENT", null)).toEqual({ kind: "selector" });
  });

  it("pins a VENDEDOR with exactly one assignment to that branch", () => {
    expect(resolveScannerBranchMode("VENDEDOR", ["b1"])).toEqual({
      kind: "single",
      branchId: "b1",
    });
  });

  it("pins a CASHIER with exactly one assignment to that branch", () => {
    expect(resolveScannerBranchMode("CASHIER", ["b9"])).toEqual({
      kind: "single",
      branchId: "b9",
    });
  });

  it("restricts a VENDEDOR with several assignments to a selector over those branches", () => {
    expect(resolveScannerBranchMode("VENDEDOR", ["b1", "b2"])).toEqual({
      kind: "selector",
      branchIds: ["b1", "b2"],
    });
  });

  it("makes a VENDEDOR without assignments read-only", () => {
    expect(resolveScannerBranchMode("VENDEDOR", [])).toEqual({ kind: "readonly" });
    expect(resolveScannerBranchMode("VENDEDOR", null)).toEqual({ kind: "readonly" });
    expect(resolveScannerBranchMode("VENDEDOR", undefined)).toEqual({ kind: "readonly" });
  });

  it("makes EMPLOYEE read-only even with assignments", () => {
    expect(resolveScannerBranchMode("EMPLOYEE", ["b1"])).toEqual({ kind: "readonly" });
  });

  it("makes SUPERADMIN read-only (mirrors the backend policy)", () => {
    expect(resolveScannerBranchMode("SUPERADMIN", ["b1"])).toEqual({ kind: "readonly" });
  });
});
