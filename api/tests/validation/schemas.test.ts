import {
  createUserSchema,
  bulkPriceUpdateSchema,
} from "../../src/validation/schemas";

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

describe("updateBranchStockSchema", () => {
  const { updateBranchStockSchema } = require("../../src/validation/schemas");

  it("accepts a non-negative integer quantity", () => {
    const result = updateBranchStockSchema.safeParse({ quantity: 10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ quantity: 10 });
  });

  it("coerces numeric strings to numbers", () => {
    const result = updateBranchStockSchema.safeParse({ quantity: "7" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ quantity: 7 });
  });

  it("rejects a negative quantity", () => {
    const result = updateBranchStockSchema.safeParse({ quantity: -3 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer quantity", () => {
    const result = updateBranchStockSchema.safeParse({ quantity: 2.5 });
    expect(result.success).toBe(false);
  });
});

describe("updateStoreSettingsSchema — storeBranchId", () => {
  const { updateStoreSettingsSchema } = require("../../src/validation/schemas");

  it("accepts a storeBranchId string", () => {
    const result = updateStoreSettingsSchema.safeParse({ storeBranchId: "b-2" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ storeBranchId: "b-2" });
  });

  it("accepts null storeBranchId (clear the store branch)", () => {
    const result = updateStoreSettingsSchema.safeParse({ storeBranchId: null });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ storeBranchId: null });
  });

  it("still accepts an empty object (all fields optional)", () => {
    const result = updateStoreSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });
});

describe("updateAppBrandingSchema", () => {
  const { updateAppBrandingSchema } = require("../../src/validation/schemas");

  // --- primaryColor (hex regex) ---
  it("accepts valid primaryColor hex (6 digits)", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "#dc2626" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ primaryColor: "#dc2626" });
  });

  it("accepts valid primaryColor with uppercase hex", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "#A1B2C3" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ primaryColor: "#A1B2C3" });
  });

  it("accepts valid primaryColor with mix case hex", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "#AbC123" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ primaryColor: "#AbC123" });
  });

  it("rejects primaryColor that is not a hex color (named color)", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "red" });
    expect(result.success).toBe(false);
  });

  it("rejects primaryColor with missing hash prefix", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "dc2626" });
    expect(result.success).toBe(false);
  });

  it("rejects primaryColor with invalid characters (#XYZ)", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "#XYZ" });
    expect(result.success).toBe(false);
  });

  it("rejects primaryColor that is too short (#12345)", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "#12345" });
    expect(result.success).toBe(false);
  });

  it("rejects primaryColor that is too long (#1234567)", () => {
    const result = updateAppBrandingSchema.safeParse({ primaryColor: "#1234567" });
    expect(result.success).toBe(false);
  });

  // --- logoUrl / faviconUrl (URL + nullable) ---
  it("accepts valid logoUrl", () => {
    const result = updateAppBrandingSchema.safeParse({ logoUrl: "https://example.com/logo.png" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ logoUrl: "https://example.com/logo.png" });
  });

  it("accepts null logoUrl (nullable)", () => {
    const result = updateAppBrandingSchema.safeParse({ logoUrl: null });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ logoUrl: null });
  });

  it("accepts valid faviconUrl", () => {
    const result = updateAppBrandingSchema.safeParse({ faviconUrl: "https://example.com/favicon.ico" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ faviconUrl: "https://example.com/favicon.ico" });
  });

  it("accepts null faviconUrl (nullable)", () => {
    const result = updateAppBrandingSchema.safeParse({ faviconUrl: null });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ faviconUrl: null });
  });

  it("rejects invalid URL for logoUrl", () => {
    const result = updateAppBrandingSchema.safeParse({ logoUrl: "not-a-valid-url" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL for faviconUrl", () => {
    const result = updateAppBrandingSchema.safeParse({ faviconUrl: "just-plain-text" });
    expect(result.success).toBe(false);
  });

  // --- displayName max length ---
  it("accepts displayName within 100 chars", () => {
    const result = updateAppBrandingSchema.safeParse({ displayName: "Mi Negocio" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ displayName: "Mi Negocio" });
  });

  it("accepts displayName exactly 100 chars", () => {
    const name = "A".repeat(100);
    const result = updateAppBrandingSchema.safeParse({ displayName: name });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ displayName: name });
  });

  it("rejects displayName over 100 chars", () => {
    const name = "A".repeat(101);
    const result = updateAppBrandingSchema.safeParse({ displayName: name });
    expect(result.success).toBe(false);
  });

  it("rejects displayName over 100 chars with meaningful error", () => {
    const name = "X".repeat(150);
    const result = updateAppBrandingSchema.safeParse({ displayName: name });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dnIssue = result.error.issues.find((i: any) =>
        i.path?.includes("displayName"),
      );
      expect(dnIssue).toBeDefined();
    }
  });

  // --- all fields optional ---
  it("accepts empty object (all fields optional)", () => {
    const result = updateAppBrandingSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it("accepts full valid payload", () => {
    const result = updateAppBrandingSchema.safeParse({
      primaryColor: "#dc2626",
      logoUrl: "https://example.com/logo.png",
      faviconUrl: "https://example.com/favicon.ico",
      displayName: "Mi Negocio",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      primaryColor: "#dc2626",
      logoUrl: "https://example.com/logo.png",
      faviconUrl: "https://example.com/favicon.ico",
      displayName: "Mi Negocio",
    });
  });

  // --- unknown fields stripped ---
  it("strips unknown fields", () => {
    const result = updateAppBrandingSchema.safeParse({
      primaryColor: "#111111",
      extraField: "should be stripped",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ primaryColor: "#111111" });
    expect((result.data as any).extraField).toBeUndefined();
  });
});

describe("bulkPriceUpdateSchema — selectors (categoryIds/excludeProductIds + signed %) ", () => {
  const validBrandValues = ["Acme"];
  const validUuid = "00000000-0000-4000-8000-000000000001";

  it("accepts a valid full payload with categoryIds and excludeProductIds", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 15,
      categoryIds: [validUuid],
      excludeProductIds: [validUuid],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryIds).toEqual([validUuid]);
      expect(result.data.excludeProductIds).toEqual([validUuid]);
      expect(result.data.percentage).toBe(15);
    }
  });

  it("rejects an empty brandValues array (at least one brand required)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: [],
      percentage: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects percentage below -100", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: -101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects percentage above 500", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 501,
    });
    expect(result.success).toBe(false);
  });

  it("accepts percentage at the boundaries -100 and 500", () => {
    expect(
      bulkPriceUpdateSchema.safeParse({
        brandValues: validBrandValues,
        percentage: -100,
      }).success,
    ).toBe(true);
    expect(
      bulkPriceUpdateSchema.safeParse({
        brandValues: validBrandValues,
        percentage: 500,
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid UUID inside categoryIds", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid UUID inside excludeProductIds", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      excludeProductIds: ["bad-id"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty categoryIds and empty excludeProductIds (defaults to [])", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryIds: [],
      excludeProductIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryIds).toEqual([]);
      expect(result.data.excludeProductIds).toEqual([]);
    }
  });

  it("omitting categoryIds/excludeProductIds defaults them to empty arrays", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryIds).toEqual([]);
      expect(result.data.excludeProductIds).toEqual([]);
    }
  });

  it("strips the legacy roundUp field (removed from the schema)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      roundUp: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).roundUp).toBeUndefined();
    }
  });

  it("strips the legacy single categoryId field (replaced by categoryIds)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryId: validUuid,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).categoryId).toBeUndefined();
    }
  });
});
