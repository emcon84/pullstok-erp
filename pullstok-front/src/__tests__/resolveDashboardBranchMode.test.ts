import { describe, it, expect } from "vitest";
import {
  resolveDashboardBranchMode,
} from "../constants/rolePermissions";

describe("resolveDashboardBranchMode", () => {
  it("returns single mode for VENDEDOR with exactly 1 branch assignment", () => {
    const mode = resolveDashboardBranchMode("VENDEDOR", ["br-1"]);
    expect(mode).toEqual({ kind: "single", branchId: "br-1" });
  });

  it("returns single mode for CASHIER with exactly 1 branch assignment", () => {
    const mode = resolveDashboardBranchMode("CASHIER", ["br-abc"]);
    expect(mode).toEqual({ kind: "single", branchId: "br-abc" });
  });

  it("returns org-wide for ADMIN (no branch filter)", () => {
    const mode = resolveDashboardBranchMode("ADMIN", null);
    expect(mode).toEqual({ kind: "org-wide" });
  });

  it("returns org-wide for MANAGEMENT", () => {
    const mode = resolveDashboardBranchMode("MANAGEMENT", []);
    expect(mode).toEqual({ kind: "org-wide" });
  });

  it("returns org-wide for CASHIER with multiple branches", () => {
    const mode = resolveDashboardBranchMode("CASHIER", ["br-1", "br-2"]);
    expect(mode).toEqual({ kind: "org-wide" });
  });

  it("returns org-wide for VENDEDOR with no branchIds", () => {
    const mode = resolveDashboardBranchMode("VENDEDOR", []);
    expect(mode).toEqual({ kind: "org-wide" });
  });

  it("returns org-wide for EMPLOYEE", () => {
    const mode = resolveDashboardBranchMode("EMPLOYEE", ["br-1"]);
    expect(mode).toEqual({ kind: "org-wide" });
  });

  it("returns org-wide for SUPERADMIN", () => {
    const mode = resolveDashboardBranchMode("SUPERADMIN", null);
    expect(mode).toEqual({ kind: "org-wide" });
  });

  it("returns org-wide when branchIds is null for any role", () => {
    const mode = resolveDashboardBranchMode("VENDEDOR", null);
    expect(mode).toEqual({ kind: "org-wide" });
  });
});
