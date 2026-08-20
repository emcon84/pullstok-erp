import {
  createUserSchema,
  bulkPriceUpdateSchema,
  updateBusinessHoursSchema,
  createSaleSchema,
  applyPriceListSchema,
  adjustPriceListSchema,
  arcaSettingsSchema,
  createSaleInvoiceSchema,
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

  it("accepts a payload WITHOUT the global percentage (only category overrides)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      categoryIds: [validUuid],
      excludeProductIds: [],
      categoryPercentages: [{ categoryId: validUuid, percentage: 5 }],
      productPercentages: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.percentage).toBeUndefined();
      expect(result.data.categoryPercentages).toHaveLength(1);
    }
  });

  it("rejects empty brandValues without any scope filter (brands/providers/categories)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: [],
      percentage: 10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty brandValues when providerIds is present (provider-only scope)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: [],
      providerIds: [crypto.randomUUID()],
      percentage: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandValues).toEqual([]);
      expect(result.data.providerIds).toHaveLength(1);
    }
  });

  it("accepts empty brandValues when categoryIds is present (category-only scope)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: [],
      categoryIds: [crypto.randomUUID()],
      percentage: 10,
    });
    expect(result.success).toBe(true);
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

describe("bulkPriceUpdateSchema — providerIds (sdd/alican-wholesale-price-list/providers)", () => {
  const validBrandValues = ["Acme"];
  const providerA = "00000000-0000-4000-8000-0000000000aa";
  const providerB = "00000000-0000-4000-8000-0000000000bb";

  it("accepts an optional array of provider uuids", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      providerIds: [providerA, providerB],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerIds).toEqual([providerA, providerB]);
    }
  });

  it("omitting providerIds defaults it to an empty array (no provider filter, back-compat)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerIds).toEqual([]);
    }
  });

  it("accepts an explicit empty providerIds array", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      providerIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerIds).toEqual([]);
    }
  });

  it("rejects a non-uuid value inside providerIds", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      providerIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkPriceUpdateSchema — priceListTypes (tipo de planilla SECO/WET)", () => {
  const validBrandValues = ["Acme"];

  it("accepts an array of valid price list types (SECO/WET)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      priceListTypes: ["SECO", "WET"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceListTypes).toEqual(["SECO", "WET"]);
    }
  });

  it("omitting priceListTypes defaults it to an empty array (no type filter, back-compat)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceListTypes).toEqual([]);
    }
  });

  it("accepts an explicit empty priceListTypes array", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      priceListTypes: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceListTypes).toEqual([]);
    }
  });

  it("rejects an invalid price list type value", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      priceListTypes: ["SECO", "HUMEDO"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts priceListTypes as the sole scope filter (no brands/providers/categories)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: [],
      percentage: 10,
      priceListTypes: ["SECO"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty brandValues with no scope filter at all (empty priceListTypes too)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: [],
      percentage: 10,
      priceListTypes: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkPriceUpdateSchema — per-category/product override arrays", () => {
  const catA = "00000000-0000-4000-8000-0000000000aa";
  const catB = "00000000-0000-4000-8000-0000000000bb";
  const prodP = "00000000-0000-4000-8000-0000000000cc";
  const validBrandValues = ["Acme"];

  it("defaults missing override arrays to empty arrays (no-override payload still parses)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryPercentages).toEqual([]);
      expect(result.data.productPercentages).toEqual([]);
    }
  });

  it("parses override entries with coerced numeric percentage", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryPercentages: [{ categoryId: catA, percentage: "10" }],
      productPercentages: [{ productId: prodP, percentage: 20 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryPercentages).toEqual([
        { categoryId: catA, percentage: 10 },
      ]);
      expect(result.data.productPercentages).toEqual([
        { productId: prodP, percentage: 20 },
      ]);
    }
  });

  it("rejects an override percentage above 500 (S11)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      productPercentages: [{ productId: prodP, percentage: 501 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an override percentage below -100 (S11)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryPercentages: [{ categoryId: catA, percentage: -101 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid uuid inside an override entry (S12)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryPercentages: [{ categoryId: "nope", percentage: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an override array with more than 500 entries (REQ-1 edge)", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      categoryId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      percentage: 10,
    }));
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryPercentages: many,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.issues.map((i) => i.message).join(" | ");
      expect(flat).toContain("Máximo 500");
    }
  });

  it("rejects duplicate categoryId entries naming the duplicated key (S9)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      categoryPercentages: [
        { categoryId: catA, percentage: 10 },
        { categoryId: catA, percentage: 20 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.issues.map((i) => i.message).join(" | ");
      expect(flat).toContain(catA);
    }
  });

  it("rejects duplicate productId entries naming the duplicated key (S9)", () => {
    const result = bulkPriceUpdateSchema.safeParse({
      brandValues: validBrandValues,
      percentage: 10,
      productPercentages: [
        { productId: prodP, percentage: 10 },
        { productId: prodP, percentage: 20 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.issues.map((i) => i.message).join(" | ");
      expect(flat).toContain(prodP);
    }
  });
});

describe("createSaleSchema — saleMode-aware quantity validation (B-06/B-08)", () => {
  const base = {
    productId: "p-1",
    quantity: 3,
    price: 100,
  };

  it("absent saleMode + integer quantity = legacy bolsa-cerrada sale stays valid", () => {
    const result = createSaleSchema.safeParse({ products: [base] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.products[0].saleMode).toBe("BOLSA_CERRADA");
      expect(result.data.products[0].quantity).toBe(3);
    }
  });

  it("BOLSA_CERRADA accepts positive integers", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...base, saleMode: "BOLSA_CERRADA", quantity: 7 }],
    });
    expect(result.success).toBe(true);
  });

  it("BOLSA_CERRADA rejects fractional quantity (2.5)", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...base, saleMode: "BOLSA_CERRADA", quantity: 2.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("POR_PESO accepts positive decimal kg with 2dp (2.35)", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...base, saleMode: "POR_PESO", quantity: 2.35 }],
    });
    expect(result.success).toBe(true);
  });

  it("POR_PESO rejects quantity with more than 2 decimals (1.234 — B-06)", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...base, saleMode: "POR_PESO", quantity: 1.234 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.issues.map((i) => i.message).join(" | ");
      expect(flat).toMatch(/0\.01|2|decimal/i);
    }
  });

  it("POR_MONTO accepts positive amounts with 2dp", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...base, saleMode: "POR_MONTO", quantity: 500 }],
    });
    expect(result.success).toBe(true);
  });

  it("POR_MONTO rejects non-positive amount (B-07)", () => {
    expect(
      createSaleSchema.safeParse({
        products: [{ ...base, saleMode: "POR_MONTO", quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      createSaleSchema.safeParse({
        products: [{ ...base, saleMode: "POR_MONTO", quantity: -10 }],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown saleMode value", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...base, saleMode: "POR_KILO" }],
    });
    expect(result.success).toBe(false);
  });

  it("mixed cart: bolsa integer line + loose decimal line both accepted (B-08)", () => {
    const result = createSaleSchema.safeParse({
      products: [
        { ...base, quantity: 3 },
        { ...base, quantity: 2.35, saleMode: "POR_PESO" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("mixed cart rejects a bad loose line while the bolsa line is fine", () => {
    const result = createSaleSchema.safeParse({
      products: [
        { ...base, quantity: 3 },
        { ...base, quantity: 1.234, saleMode: "POR_PESO" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ── Ventas sueltas por celda de la planilla (sdd/loose-lines-stock) ──
describe("createSaleSchema — loose line by loosePriceId (loose-lines-stock)", () => {
  it("POR_PESO without productId accepted when loosePriceId is present", () => {
    const result = createSaleSchema.safeParse({
      products: [
        { loosePriceId: "cell-1", quantity: 2.35, price: 360, saleMode: "POR_PESO" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.products[0].productId).toBeUndefined();
      expect(result.data.products[0].loosePriceId).toBe("cell-1");
    }
  });

  it("accepts looseName alongside loosePriceId", () => {
    const result = createSaleSchema.safeParse({
      products: [
        {
          loosePriceId: "cell-1",
          looseName: "MAXXIUM ADULTO",
          quantity: 1,
          price: 2500,
          saleMode: "POR_PESO",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.products[0].looseName).toBe("MAXXIUM ADULTO");
    }
  });

  it("POR_MONTO accepted with only loosePriceId", () => {
    const result = createSaleSchema.safeParse({
      products: [
        { loosePriceId: "cell-1", quantity: 500, price: 2500, saleMode: "POR_MONTO" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects POR_PESO without productId AND loosePriceId", () => {
    const result = createSaleSchema.safeParse({
      products: [{ quantity: 2.5, price: 360, saleMode: "POR_PESO" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.issues.map((i: any) => i.message).join(" | ");
      expect(flat).toMatch(/loosePriceId o productId/i);
    }
  });

  it("rejects BOLSA_CERRADA without productId (bolsa física exige producto)", () => {
    const result = createSaleSchema.safeParse({
      products: [{ loosePriceId: "cell-1", quantity: 2, price: 100 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.issues.map((i: any) => i.message).join(" | ");
      expect(flat).toMatch(/requiere un producto/i);
    }
  });
});

describe("openBagSchema / setLooseStockSchema / listLooseStocksQuerySchema (loose-lines-stock)", () => {
  const { openBagSchema, setLooseStockSchema, listLooseStocksQuerySchema } =
    require("../../src/validation/schemas");

  it("accepts a valid open-bag payload (branchId optional — vendedor la resuelve)", () => {
    expect(openBagSchema.safeParse({ productId: "p-1" }).success).toBe(true);
    expect(openBagSchema.safeParse({ productId: "p-1", branchId: "b-1" }).success).toBe(true);
  });

  it("rejects open-bag without productId", () => {
    expect(openBagSchema.safeParse({ branchId: "b-1" }).success).toBe(false);
  });

  it("rejects open-bag with an empty productId", () => {
    expect(openBagSchema.safeParse({ productId: "" }).success).toBe(false);
  });

  it("strips unknown open-bag fields", () => {
    const result = openBagSchema.safeParse({ productId: "p-1", extra: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any).extra).toBeUndefined();
  });

  it("accepts a non-negative quantity with 2dp for the manual set", () => {
    expect(setLooseStockSchema.safeParse({ branchId: "b-1", quantity: 12.5 }).success).toBe(true);
    expect(setLooseStockSchema.safeParse({ branchId: "b-1", quantity: "7" }).success).toBe(true);
    expect(setLooseStockSchema.safeParse({ branchId: "b-1", quantity: 0 }).success).toBe(true);
  });

  it("rejects a negative quantity or more than 2dp", () => {
    expect(setLooseStockSchema.safeParse({ branchId: "b-1", quantity: -1 }).success).toBe(false);
    expect(setLooseStockSchema.safeParse({ branchId: "b-1", quantity: 1.234 }).success).toBe(false);
  });

  it("rejects the manual set without branchId", () => {
    expect(setLooseStockSchema.safeParse({ quantity: 5 }).success).toBe(false);
  });

  it("accepts the list query (branchId optional)", () => {
    expect(listLooseStocksQuerySchema.safeParse({}).success).toBe(true);
    expect(listLooseStocksQuerySchema.safeParse({ branchId: "b-1" }).success).toBe(true);
  });
});

describe("updateProductSchema — weightKg/bulkFactor + priceKgSuelto manual: número = manual, null = automático", () => {
  const { updateProductSchema, createProductSchema } = require("../../src/validation/schemas");

  it("accepts weightKg (positive, 2dp) and bulkFactor (positive, 2dp)", () => {
    const result = updateProductSchema.safeParse({
      weightKg: 7.5,
      bulkFactor: 1.25,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weightKg).toBe(7.5);
      expect(result.data.bulkFactor).toBe(1.25);
    }
  });

  it("accepts bulkFactor: null = use org default", () => {
    const result = updateProductSchema.safeParse({ bulkFactor: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bulkFactor).toBeNull();
  });

  it("rejects weightKg with more than 2 decimals", () => {
    const result = updateProductSchema.safeParse({ weightKg: 7.555 });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive weightKg and bulkFactor", () => {
    expect(updateProductSchema.safeParse({ weightKg: 0 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ bulkFactor: 0 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ weightKg: -1 }).success).toBe(false);
  });

  it("accepts a manual priceKgSuelto number (manual wins)", () => {
    const result = updateProductSchema.safeParse({ priceKgSuelto: 123 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceKgSuelto).toBe(123);
    }
  });

  it("accepts priceKgSuelto: null = back to automatic", () => {
    const result = updateProductSchema.safeParse({ priceKgSuelto: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceKgSuelto).toBeNull();
    }
  });

  it("accepts priceKgSuelto as numeric string via coerce (frontend sends numbers)", () => {
    const result = updateProductSchema.safeParse({ priceKgSuelto: "2600" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceKgSuelto).toBe(2600);
    }
  });

  it("rejects a negative priceKgSuelto", () => {
    const result = updateProductSchema.safeParse({ priceKgSuelto: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects priceKgSuelto with more than 2 decimals (multipleOf 0.01)", () => {
    const result = updateProductSchema.safeParse({ priceKgSuelto: 1.234 });
    expect(result.success).toBe(false);
  });

  it("accepts priceKgSuelto with exactly 2 decimals", () => {
    const result = updateProductSchema.safeParse({ priceKgSuelto: 12.34 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceKgSuelto).toBe(12.34);
    }
  });

  it("omitting priceKgSuelto leaves nothing in the payload (absent = untouched)", () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceKgSuelto).toBeUndefined();
    }
  });

  it("createProductSchema accepts optional weightKg/bulkFactor (no recompute on create — staleness rule)", () => {
    const result = createProductSchema.safeParse({
      name: "Alimento 15kg",
      price: 4500,
      categoryId: "c-1",
      quantity: 10,
      weightKg: 15,
      bulkFactor: 1.2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weightKg).toBe(15);
      expect(result.data.bulkFactor).toBe(1.2);
    }
  });
});

describe("updateBusinessHoursSchema — horario comercial", () => {
  const validDays = [
    { day: 0, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 1, enabled: true, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 2, enabled: true, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 3, enabled: true, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 4, enabled: true, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 5, enabled: true, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 6, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  ];

  it("acepta timezone IANA válida + 7 días con al menos uno enabled", () => {
    const result = updateBusinessHoursSchema.safeParse({
      timezone: "America/Argentina/Buenos_Aires",
      days: validDays,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza timezone inválida", () => {
    const result = updateBusinessHoursSchema.safeParse({
      timezone: "Mars/OlympusMons",
      days: validDays,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza menos de 7 días (el gate necesita el día completo)", () => {
    const result = updateBusinessHoursSchema.safeParse({
      timezone: "America/Argentina/Buenos_Aires",
      days: validDays.slice(0, 3),
    });
    expect(result.success).toBe(false);
  });

  it("rechaza open >= close (string compare zero-padded)", () => {
    const badDays = validDays.map((d) =>
      d.day === 1 ? { ...d, slots: [{ open: "19:00", close: "09:00" }] } : d,
    );
    const result = updateBusinessHoursSchema.safeParse({
      timezone: "America/Argentina/Buenos_Aires",
      days: badDays,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza formato HH:MM inválido", () => {
    const badDays = validDays.map((d) =>
      d.day === 1 ? { ...d, slots: [{ open: "9am", close: "19:00" }] } : d,
    );
    const result = updateBusinessHoursSchema.safeParse({
      timezone: "America/Argentina/Buenos_Aires",
      days: badDays,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza todos los días disabled (sin sentido: bloquearía siempre)", () => {
    const allDisabled = validDays.map((d) => ({ ...d, enabled: false }));
    const result = updateBusinessHoursSchema.safeParse({
      timezone: "America/Argentina/Buenos_Aires",
      days: allDisabled,
    });
    expect(result.success).toBe(false);
  });
});

describe("applyPriceListSchema — decisiones del preview (position como idTemporal, D6)", () => {
  const validDecision = {
    position: 0,
    accion: "import",
    productId: "00000000-0000-4000-8000-000000000001",
    nombre: "SIEGER Puppy Mini x 1 Kg.",
    precioSinIva: 8795,
    precioConIva: 10642,
  };

  const validBody = {
    layout: "SECO",
    period: "2026-08-10",
    sourceFilename: "082026. LP Alican SECO - 10ago2026.pdf",
    rows: [validDecision],
  };

  it("accepts a valid payload with a full decision", () => {
    const result = applyPriceListSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid position (negative / non-integer)", () => {
    expect(
      applyPriceListSchema.safeParse({
        ...validBody,
        rows: [{ ...validDecision, position: -1 }],
      }).success,
    ).toBe(false);
    expect(
      applyPriceListSchema.safeParse({
        ...validBody,
        rows: [{ ...validDecision, position: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid accion", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [{ ...validDecision, accion: "delete" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid productId", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [{ ...validDecision, productId: "no-es-uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty rows array", () => {
    const result = applyPriceListSchema.safeParse({ ...validBody, rows: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed period (not ISO)", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      period: "10/08/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate positions (anti-tamper)", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [validDecision, validDecision],
    });
    expect(result.success).toBe(false);
  });

  it("accepts omit decisions without productId", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [
        { position: 0, accion: "omit", nombre: "STARTER Kit", precioSinIva: null, precioConIva: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an import decision without productId (planilla-only row)", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [
        { position: 0, accion: "import", nombre: "Producto Sin Match x 3 Kg.", precioSinIva: 1000, precioConIva: 1210 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0].productId).toBeUndefined();
    }
  });

  it("accepts applyPrices as boolean (default undefined cuando se omite)", () => {
    expect(applyPriceListSchema.safeParse({ ...validBody, applyPrices: true }).success).toBe(true);
    expect(applyPriceListSchema.safeParse({ ...validBody, applyPrices: false }).success).toBe(true);
    const withoutFlag = applyPriceListSchema.safeParse(validBody);
    expect(withoutFlag.success).toBe(true);
    if (withoutFlag.success) {
      expect(withoutFlag.data.applyPrices).toBeUndefined();
    }
  });

  it("rejects a non-boolean applyPrices", () => {
    expect(
      applyPriceListSchema.safeParse({ ...validBody, applyPrices: "yes" }).success,
    ).toBe(false);
    expect(
      applyPriceListSchema.safeParse({ ...validBody, applyPrices: 1 }).success,
    ).toBe(false);
  });

  it("accepts providerName (sdd/alican-wholesale-price-list/providers) and trims it", () => {
    const result = applyPriceListSchema.safeParse({ ...validBody, providerName: "  ALICAN  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerName).toBe("ALICAN");
    }
    expect(applyPriceListSchema.safeParse(validBody).success).toBe(true); // sin campo → ok
  });

  it("rejects an empty / whitespace-only providerName", () => {
    expect(applyPriceListSchema.safeParse({ ...validBody, providerName: "" }).success).toBe(false);
    expect(applyPriceListSchema.safeParse({ ...validBody, providerName: "   " }).success).toBe(false);
  });
});

describe("adjustPriceListSchema — ajuste masivo de sugeridos", () => {
  it("accepts a percentage-only payload", () => {
    expect(adjustPriceListSchema.safeParse({ percentage: 10 }).success).toBe(true);
  });

  it("rejects a percentage outside −100..500", () => {
    expect(adjustPriceListSchema.safeParse({ percentage: 501 }).success).toBe(false);
    expect(adjustPriceListSchema.safeParse({ percentage: -101 }).success).toBe(false);
  });

  it("rejects duplicate entryOverrides (anti-duplicados)", () => {
    const override = {
      entryId: "00000000-0000-4000-8000-000000000002",
      suggestedPrice: 15000,
    };
    const result = adjustPriceListSchema.safeParse({
      percentage: 10,
      entryOverrides: [override, override],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid excludeEntryId", () => {
    const result = adjustPriceListSchema.safeParse({ excludeEntryIds: ["zzz"] });
    expect(result.success).toBe(false);
  });

  it("defaults arrays when omitted", () => {
    const result = adjustPriceListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excludeEntryIds).toEqual([]);
      expect(result.data.entryOverrides).toEqual([]);
    }
  });
});

describe("arcaSettingsSchema (sdd/arca-facturacion-electronica)", () => {
  const valid = {
    cuitEmisor: "30709706701",
    puntoVenta: 2,
    environment: "HOMOLOGACION",
    certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
    keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
  };

  it("acepta un payload válido y normaliza CUIT con guiones", () => {
    const result = arcaSettingsSchema.safeParse({
      ...valid,
      cuitEmisor: "30-70970670-1",
      enabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it("rechaza CUIT con DV incorrecto", () => {
    const result = arcaSettingsSchema.safeParse({
      ...valid,
      cuitEmisor: "30-70970670-2",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza punto de venta fuera de rango (0 y 10000)", () => {
    expect(arcaSettingsSchema.safeParse({ ...valid, puntoVenta: 0 }).success).toBe(false);
    expect(arcaSettingsSchema.safeParse({ ...valid, puntoVenta: 10000 }).success).toBe(false);
  });

  it("rechaza environment inválido y rutas vacías", () => {
    expect(
      arcaSettingsSchema.safeParse({ ...valid, environment: "LOCAL" }).success,
    ).toBe(false);
    expect(
      arcaSettingsSchema.safeParse({ ...valid, certPath: "" }).success,
    ).toBe(false);
    expect(
      arcaSettingsSchema.safeParse({ ...valid, keyPath: "" }).success,
    ).toBe(false);
  });

  it("enabled default false si se omite", () => {
    const result = arcaSettingsSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });
});

describe("createSaleInvoiceSchema — customerId opcional (spec 6.1)", () => {
  it("acepta body SIN customerId (Factura B de mostrador sin identificar)", () => {
    const result = createSaleInvoiceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("acepta customerId presente", () => {
    const result = createSaleInvoiceSchema.safeParse({ customerId: "cust-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerId).toBe("cust-1");
    }
  });
});
