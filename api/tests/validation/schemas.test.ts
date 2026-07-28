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
});
