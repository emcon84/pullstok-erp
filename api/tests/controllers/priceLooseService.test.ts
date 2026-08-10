import {
  resolveEffectiveFactor,
  computePriceKgSuelto,
  isLooseEligible,
  recomputeForFactorSave,
  recomputeForProduct,
  recomputeForBulkPriceUpdate,
  recomputeForCsvImport,
  DEFAULT_BULK_FACTOR,
} from "../../src/services/priceLooseService";

// ── Pure functions (B-04) ──
describe("resolveEffectiveFactor — COALESCE(product.bulkFactor, org.bulkFactor, 1.20)", () => {
  it("product override wins over org factor", () => {
    expect(resolveEffectiveFactor(1.3, 1.5)).toBe(1.5);
  });

  it("org factor used when product has no override (null)", () => {
    expect(resolveEffectiveFactor(1.3, null)).toBe(1.3);
  });

  it("falls back to DEFAULT_BULK_FACTOR when both are missing", () => {
    expect(resolveEffectiveFactor(null, null)).toBe(DEFAULT_BULK_FACTOR);
    expect(resolveEffectiveFactor(undefined, undefined)).toBe(DEFAULT_BULK_FACTOR);
  });

  it("ignores non-positive overrides and falls back to org/default", () => {
    expect(resolveEffectiveFactor(1.3, 0)).toBe(1.3);
    expect(resolveEffectiveFactor(null, -1)).toBe(DEFAULT_BULK_FACTOR);
  });
});

describe("computePriceKgSuelto — round2(price/weightKg × factor), null unless price>0 && weightKg>0", () => {
  it("computes the B-04 spec scenario: 4500/15×1.2 → 360", () => {
    expect(computePriceKgSuelto(4500, 15, 1.2)).toBe(360);
  });

  it("returns null when weightKg is null (product not eligible)", () => {
    expect(computePriceKgSuelto(4500, null, 1.2)).toBeNull();
  });

  it("returns null when price is 0 or weightKg is 0", () => {
    expect(computePriceKgSuelto(0, 15, 1.2)).toBeNull();
    expect(computePriceKgSuelto(4500, 0, 1.2)).toBeNull();
  });

  it("rounds to 2dp half-up (B-04 single round at the end)", () => {
    expect(computePriceKgSuelto(150.25, 1, 1)).toBe(150.25);
    expect(computePriceKgSuelto(1.005, 1, 1)).toBe(1.01);
  });
});

describe("isLooseEligible — priceKgSuelto > 0", () => {
  it("returns true when priceKgSuelto is positive", () => {
    expect(isLooseEligible({ priceKgSuelto: 360 })).toBe(true);
  });

  it("returns false when priceKgSuelto is null/0/undefined", () => {
    expect(isLooseEligible({ priceKgSuelto: null })).toBe(false);
    expect(isLooseEligible({ priceKgSuelto: 0 })).toBe(false);
    expect(isLooseEligible({})).toBe(false);
  });
});

// ── recomputeForFactorSave (B-05a: WHERE bulkFactor IS NULL, overrides intact) ──
const buildTx = () => ({
  product: {
    findMany: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

describe("recomputeForFactorSave — org-scoped, only bulkFactor IS NULL rows", () => {
  it("recomputes only products with bulkFactor IS NULL and returns affected count", async () => {
    const tx = buildTx();
    tx.product.findMany.mockResolvedValue([
      { id: "p-a", price: 4500, weightKg: 15 },
      { id: "p-b", price: 500, weightKg: 1 },
    ]);

    const result = await recomputeForFactorSave(tx as any, "org-1", 1.2);

    expect(tx.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1", bulkFactor: null }),
      }),
    );
    expect(result.affected).toBe(2);
    // p-a: 4500/15×1.2=360 ; p-b: 500/1×1.2=600
    const writes = tx.product.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(writes).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ priceKgSuelto: 360 }) }),
    );
    expect(writes).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ priceKgSuelto: 600 }) }),
    );
  });

  it("leaves products WITH a bulkFactor override untouched (no updateMany for them)", async () => {
    const tx = buildTx();
    tx.product.findMany.mockResolvedValue([
      { id: "p-override", price: 100, weightKg: 1, bulkFactor: 1.5 },
    ]);

    await recomputeForFactorSave(tx as any, "org-1", 1.2);

    // The selector asks for bulkFactor IS NULL, so the override row is never
    // even fetched; if the mock returned it (as above), the service must NOT
    // write it back — the updateMany where clauses must not match it.
    const writes = tx.product.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(writes.length).toBeGreaterThanOrEqual(0);
    for (const w of writes) {
      expect(w.where.id).not.toBe("p-override");
    }
  });

  it("returns affected 0 when no products match", async () => {
    const tx = buildTx();
    tx.product.findMany.mockResolvedValue([]);

    const result = await recomputeForFactorSave(tx as any, "org-1", 1.2);

    expect(result.affected).toBe(0);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});

// ── recomputeForProduct (B-05b: after single PUT) ──
describe("recomputeForProduct — after product PUT", () => {
  it("recomputes priceKgSuelto with COALESCE factor and returns it", async () => {
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "p-x",
          price: 4500,
          weightKg: 15,
          bulkFactor: null,
          organizationId: "org-1",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue({ bulkFactor: 1.2 }),
      },
    };

    const result = await recomputeForProduct(tx as any, "p-x");

    expect(result.priceKgSuelto).toBe(360);
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "p-x", organizationId: "org-1" }),
        data: { priceKgSuelto: 360 },
      }),
    );
  });

  it("uses product bulkFactor override when present (org factor ignored)", async () => {
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "p-y",
          price: 100,
          weightKg: 1,
          bulkFactor: 1.5,
          organizationId: "org-1",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue({ bulkFactor: 1.2 }),
      },
    };

    const result = await recomputeForProduct(tx as any, "p-y");

    expect(result.priceKgSuelto).toBe(150); // 100/1 × 1.5, NOT 100/1 × 1.2
    expect(tx.pricingSetting.findFirst).not.toHaveBeenCalled();
  });

  it("returns affected 0 and null price when product not found", async () => {
    const tx = {
      product: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      pricingSetting: { findFirst: jest.fn() },
    };

    const result = await recomputeForProduct(tx as any, "missing");

    expect(result).toEqual({ affected: 0, priceKgSuelto: null });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("writes null priceKgSuelto when weightKg is null (not eligible)", async () => {
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: "p-z",
          price: 4500,
          weightKg: null,
          bulkFactor: null,
          organizationId: "org-1",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pricingSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const result = await recomputeForProduct(tx as any, "p-z");

    expect(result.priceKgSuelto).toBeNull();
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priceKgSuelto: null } }),
    );
  });
});

// ── recomputeForBulkPriceUpdate (B-05c: inside bulk price apply tx) ──
describe("recomputeForBulkPriceUpdate — same resolved set, org-scoped", () => {
  const buildTx = () => ({
    product: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    pricingSetting: { findFirst: jest.fn().mockResolvedValue({ bulkFactor: 1.2 }) },
  });

  it("recomputes every resolved product after price writes", async () => {
    const tx = buildTx();
    tx.product.findMany.mockResolvedValue([
      { id: "b-1", price: 4500, weightKg: 15, bulkFactor: null },
      { id: "b-2", price: 1200, weightKg: 2, bulkFactor: null },
    ]);

    const where = { id: { in: ["b-1", "b-2"] } };
    const result = await recomputeForBulkPriceUpdate(tx as any, where, "org-1");

    expect(tx.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["b-1", "b-2"] },
          organizationId: "org-1",
        }),
        select: expect.anything(),
      }),
    );
    expect(result.affected).toBe(2);
    const writes = tx.product.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(writes).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ priceKgSuelto: 360 }) }),
    );
    expect(writes).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ priceKgSuelto: 720 }) }),
    );
  });

  it("applies product bulkFactor overrides in the same run (B-05a rule: overrides to recompute WITH their own factor)", async () => {
    const tx = buildTx();
    tx.product.findMany.mockResolvedValue([
      { id: "b-ovo", price: 100, weightKg: 1, bulkFactor: 1.5 },
    ]);

    const result = await recomputeForBulkPriceUpdate(tx as any, {}, "org-1");

    expect(result.affected).toBe(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priceKgSuelto: 150 } }),
    );
  });
});

// ── recomputeForCsvImport (B-05d: basePrisma + explicit orgId, outside ALS) ──
describe("recomputeForCsvImport — explicit orgId scoping (B-10)", () => {
  const buildClient = () => ({
    pricingSetting: { findFirst: jest.fn().mockResolvedValue({ bulkFactor: 1.2 }) },
    product: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  it("recomputes only the created product ids for the given org", async () => {
    const client = buildClient();
    client.product.findMany.mockResolvedValue([
      { id: "c-1", price: 4500, weightKg: 15, bulkFactor: null },
    ]);

    const result = await recomputeForCsvImport(client as any, "org-9", ["c-1"]);

    expect(client.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-9", id: { in: ["c-1"] } }),
      }),
    );
    expect(result.affected).toBe(1);
    expect(client.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("reads the org PricingSetting via basePrisma pattern (findFirst by organizationId)", async () => {
    const client = buildClient();
    client.product.findMany.mockResolvedValue([
      { id: "c-2", price: 500, weightKg: 1, bulkFactor: null },
    ]);

    await recomputeForCsvImport(client as any, "org-9", ["c-2"]);

    expect(client.pricingSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-9" } }),
    );
    expect(client.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priceKgSuelto: 600 } }),
    );
  });

  it("falls back to DEFAULT_BULK_FACTOR when the org has no PricingSetting row", async () => {
    const client = buildClient();
    client.pricingSetting.findFirst.mockResolvedValue(null);
    client.product.findMany.mockResolvedValue([
      { id: "c-3", price: 100, weightKg: 1, bulkFactor: null },
    ]);

    const result = await recomputeForCsvImport(client as any, "org-9", ["c-3"]);

    expect(result.affected).toBe(1);
    expect(client.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priceKgSuelto: 120 } }), // 100/1 × 1.20 default
    );
  });

  it("scopes B-10: never reads another org's factor or products", async () => {
    const client = buildClient();
    client.product.findMany.mockResolvedValue([]);

    await recomputeForCsvImport(client as any, "org-A", ["other-org-product"]);

    // The findMany is org-scoped: a cross-org product id simply matches nothing.
    expect(client.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-A" }),
      }),
    );
    expect(client.product.updateMany).not.toHaveBeenCalled();
  });
});