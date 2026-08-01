import { describe, it, expect } from "vitest";
import {
  canEditBranchStock,
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
