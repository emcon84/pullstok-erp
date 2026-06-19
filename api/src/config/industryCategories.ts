import { Industry } from "@prisma/client";

// Categorías sugeridas por rubro para precargar el paso 2 del wizard de
// onboarding. Editables por el ADMIN antes de confirmar. OTHER queda vacío
// a propósito: no hay un set razonable de categorías para "otro rubro".
export const industryCategories: Record<Industry, string[]> = {
  FERRETERIA: [
    "Herramientas",
    "Tornillería",
    "Pintura",
    "Electricidad",
    "Plomería",
  ],
  KIOSCO: ["Golosinas", "Bebidas", "Cigarrillos", "Snacks"],
  INDUMENTARIA: ["Remeras", "Pantalones", "Calzado", "Accesorios"],
  ALMACEN: ["Almacén", "Lácteos", "Bebidas", "Limpieza"],
  OTHER: [],
};
