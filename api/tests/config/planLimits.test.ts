import { PLAN_LIMITS } from '../../src/config/planLimits';

describe('PLAN_LIMITS', () => {
  it('define los 3 planes (BASICO, PRO, PREMIUM)', () => {
    expect(Object.keys(PLAN_LIMITS).sort()).toEqual(['BASICO', 'PREMIUM', 'PRO']);
  });

  it('cada plan tiene shape { maxUsers, maxProducts, modules }', () => {
    Object.values(PLAN_LIMITS).forEach((plan) => {
      expect(plan).toHaveProperty('maxUsers');
      expect(plan).toHaveProperty('maxProducts');
      expect(Array.isArray(plan.modules)).toBe(true);
    });
  });

  it('BASICO limita a 2 usuarios y 500 productos', () => {
    expect(PLAN_LIMITS.BASICO.maxUsers).toBe(2);
    expect(PLAN_LIMITS.BASICO.maxProducts).toBe(500);
  });

  it('PRO limita a 10 usuarios y productos ilimitados (null)', () => {
    expect(PLAN_LIMITS.PRO.maxUsers).toBe(10);
    expect(PLAN_LIMITS.PRO.maxProducts).toBeNull();
  });

  it('PREMIUM es ilimitado en usuarios y productos (null)', () => {
    expect(PLAN_LIMITS.PREMIUM.maxUsers).toBeNull();
    expect(PLAN_LIMITS.PREMIUM.maxProducts).toBeNull();
  });

  it('tope de productos de tienda: BASICO=0, PRO=100, PREMIUM=ilimitado (null)', () => {
    expect(PLAN_LIMITS.BASICO.maxStoreProducts).toBe(0);
    expect(PLAN_LIMITS.PRO.maxStoreProducts).toBe(100);
    expect(PLAN_LIMITS.PREMIUM.maxStoreProducts).toBeNull();
  });

  it('solo PRO y PREMIUM incluyen el módulo "tienda"', () => {
    expect(PLAN_LIMITS.BASICO.modules).not.toContain('tienda');
    expect(PLAN_LIMITS.PRO.modules).toContain('tienda');
    expect(PLAN_LIMITS.PREMIUM.modules).toContain('tienda');
  });

  it('los módulos son acumulativos: BASICO ⊂ PRO == PREMIUM', () => {
    PLAN_LIMITS.BASICO.modules.forEach((m) => {
      expect(PLAN_LIMITS.PRO.modules).toContain(m);
    });
    PLAN_LIMITS.PRO.modules.forEach((m) => {
      expect(PLAN_LIMITS.PREMIUM.modules).toContain(m);
    });
  });
});
