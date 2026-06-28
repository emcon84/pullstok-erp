import { Plan } from "@prisma/client";

// Límites y módulos habilitados por plan. `null` en maxUsers/maxProducts/
// maxStoreProducts significa "ilimitado" (no se chequea contra ningún tope).
// `maxStoreProducts` = cuántos productos puede PUBLICAR en la tienda online
// (BASICO = 0 porque no tiene tienda; el gate de acceso vive en
// checkStoreEnabled.ts). `modules` queda definido para uso futuro (ej. ocultar
// ítems del sidebar según plan) — por ahora solo se deja el dato listo.
export const PLAN_LIMITS: Record<
  Plan,
  {
    maxUsers: number | null;
    maxProducts: number | null;
    maxStoreProducts: number | null;
    modules: string[];
  }
> = {
  BASICO: {
    maxUsers: 2,
    maxProducts: 500,
    maxStoreProducts: 0,
    modules: ["stock", "ventas", "clientes"],
  },
  PRO: {
    maxUsers: 10,
    maxProducts: null,
    maxStoreProducts: 100,
    modules: [
      "stock",
      "ventas",
      "clientes",
      "presupuestos",
      "pedidos",
      "remitos",
      "reportes",
      "tienda",
      "facturacion",
    ],
  },
  PREMIUM: {
    maxUsers: null,
    maxProducts: null,
    maxStoreProducts: null,
    // Arrays PLANOS sin herencia: cada plan lista TODOS sus módulos. PREMIUM
    // es superconjunto de PRO, así que repite todos sus módulos + "facturacion".
    // El sidebar del front (filterNavItemsByPlan) chequea este array directo,
    // por eso "facturacion" DEBE estar también acá (ver copia espejo en
    // pullstok-front/src/constants/planLimits.ts).
    modules: [
      "stock",
      "ventas",
      "clientes",
      "presupuestos",
      "pedidos",
      "remitos",
      "reportes",
      "tienda",
      "facturacion",
    ],
  },
};
