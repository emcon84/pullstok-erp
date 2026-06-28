// DEUDA TÉCNICA DOCUMENTADA: copia manual de `api/src/config/planLimits.ts`.
// No existe (todavía) un endpoint compartido que expusiera esta tabla al
// front, así que el shape y los valores se duplican a mano. Si se agrega o
// quita un módulo de un plan en el backend, hay que actualizar este archivo
// en el mismo commit o el sidebar quedará desincronizado con el backend real.
// Ver decisión documentada en sdd/facturacion-servicios/design (engram).

export type Plan = "BASICO" | "PRO" | "PREMIUM";

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
