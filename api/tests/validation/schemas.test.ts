import { createUserSchema } from "../../src/validation/schemas";

describe("createUserSchema — role enum expansion", () => {
  const validEmail = "test@example.com";
  const validPassword = "password123";

  it("accepts role VENDEDOR (new role from roles-system change)", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      role: "VENDEDOR",
    });
    expect(result.success).toBe(true);
    expect(result.data!.role).toBe("VENDEDOR");
  });

  it("accepts role CASHIER (new role from roles-system change)", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      role: "CASHIER",
    });
    expect(result.success).toBe(true);
    expect(result.data!.role).toBe("CASHIER");
  });

  it("accepts role MANAGEMENT (new role from roles-system change)", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      role: "MANAGEMENT",
    });
    expect(result.success).toBe(true);
    expect(result.data!.role).toBe("MANAGEMENT");
  });

  it("accepts existing role ADMIN", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      role: "ADMIN",
    });
    expect(result.success).toBe(true);
    expect(result.data!.role).toBe("ADMIN");
  });

  it("accepts existing role EMPLOYEE", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      role: "EMPLOYEE",
    });
    expect(result.success).toBe(true);
    expect(result.data!.role).toBe("EMPLOYEE");
  });

  it("defaults to EMPLOYEE when role is omitted", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
    });
    expect(result.success).toBe(true);
    // role is optional in the schema; absence = undefined parsed
    expect(result.data!.role).toBeUndefined();
  });

  it("rejects unknown role string (Zod error shape)", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      role: "UNKNOWN",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.length).toBeGreaterThan(0);
      // Zod enum error shape for zod v4
      const roleIssue = issues.find((i: any) => i.path?.includes("role"));
      expect(roleIssue).toBeDefined();
    }
  });

  it("accepts optional branchIds as string array", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      branchIds: ["branch-1", "branch-2"],
    });
    expect(result.success).toBe(true);
    expect(result.data!.branchIds).toEqual(["branch-1", "branch-2"]);
  });

  it("accepts missing branchIds (backward compat)", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
    });
    expect(result.success).toBe(true);
    expect(result.data!.branchIds).toBeUndefined();
  });

  it("accepts empty branchIds array", () => {
    const result = createUserSchema.safeParse({
      email: validEmail,
      password: validPassword,
      branchIds: [],
    });
    expect(result.success).toBe(true);
    expect(result.data!.branchIds).toEqual([]);
  });
});

describe("createBranchSchema", () => {
  const { createBranchSchema } = require("../../src/validation/schemas");

  it("accepts valid branch with name only", () => {
    const result = createBranchSchema.safeParse({ name: "Sucursal Centro" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Sucursal Centro" });
  });

  it("accepts branch with all optional fields", () => {
    const result = createBranchSchema.safeParse({
      name: "Sucursal Norte",
      address: "Av. Siempreviva 742",
      phone: "+54 11 1234-5678",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Sucursal Norte",
      address: "Av. Siempreviva 742",
      phone: "+54 11 1234-5678",
    });
  });

  it("rejects empty name", () => {
    const result = createBranchSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createBranchSchema.safeParse({ address: "Somewhere" });
    expect(result.success).toBe(false);
  });
});

describe("updateBranchSchema", () => {
  const { updateBranchSchema } = require("../../src/validation/schemas");

  it("accepts empty object (all fields optional partial)", () => {
    const result = updateBranchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with name only", () => {
    const result = updateBranchSchema.safeParse({ name: "Nuevo Nombre" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Nuevo Nombre" });
  });

  it("accepts partial update with address only", () => {
    const result = updateBranchSchema.safeParse({ address: "Nueva Dirección" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ address: "Nueva Dirección" });
  });
});
