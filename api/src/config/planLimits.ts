import { Plan } from "@prisma/client";

// Límites y módulos habilitados por plan. `null` en maxUsers/maxProducts
// significa "ilimitado" (no se chequea contra ningún tope). `modules` queda
// definido para uso futuro (ej. ocultar ítems del sidebar según plan) —
// por ahora solo se deja el dato listo, no se aplica enforcement con él.
export const PLAN_LIMITS: Record<
  Plan,
  { maxUsers: number | null; maxProducts: number | null; modules: string[] }
> = {
  BASICO: {
    maxUsers: 2,
    maxProducts: 500,
    modules: ["stock", "ventas", "clientes"],
  },
  PRO: {
    maxUsers: 10,
    maxProducts: null,
    modules: [
      "stock",
      "ventas",
      "clientes",
      "presupuestos",
      "pedidos",
      "remitos",
      "reportes",
    ],
  },
  PREMIUM: {
    maxUsers: null,
    maxProducts: null,
    modules: [
      "stock",
      "ventas",
      "clientes",
      "presupuestos",
      "pedidos",
      "remitos",
      "reportes",
    ],
  },
};
