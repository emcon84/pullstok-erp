import { z } from "zod";

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "La contraseña es requerida"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida"),
  newPassword: z
    .string()
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken requerido"),
});

// ---------- Organización ----------
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  industry: z.enum(["FERRETERIA", "KIOSCO", "INDUMENTARIA", "ALMACEN", "OTHER"]).optional(),
});

// ---------- Categorías ----------
export const createCategoriesSchema = z.object({
  names: z.array(z.string().min(1)).min(1, "Debe enviar al menos una categoría"),
});

// ---------- Plataforma / usuarios ----------
export const createOrganizationSchema = z.object({
  organizationName: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug: solo minúsculas, números y guiones"),
  adminEmail: z.email(),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  plan: z.enum(["BASICO", "PRO", "PREMIUM"]).optional(),
});

export const updateOrganizationPlanSchema = z.object({
  plan: z.enum(["BASICO", "PRO", "PREMIUM"]),
});

export const registerBillingPaymentSchema = z.object({
  action: z.literal("pay"),
});

export const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
});

// ---------- Productos ----------
// Alta manual single (form de la UI): exige categoryId real, elegido de un
// <select> poblado con GET /categories. El controller valida que pertenezca a
// la organización actual antes de crear el producto (decisión #467 — evita
// que texto libre ensucie el catálogo y evita fuga cross-tenant de categoryId).
export const createProductSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.coerce.number().nonnegative("El precio no puede ser negativo"),
  description: z.string().optional(),
  categoryId: z.string().min(1, "La categoría es requerida"),
  image: z.string().optional(),
  quantity: z.coerce.number().int().nonnegative("La cantidad no puede ser negativa"),
  // Visibilidad en la tienda online (WS4). Opcional en alta/edición general;
  // el toggle dedicado de la UI usa publishProductSchema (PATCH /publish).
  publishedToStore: z.boolean().optional(),
});
export const updateProductSchema = createProductSchema.partial();

// Toggle dedicado "Publicar en tienda" (WS4 — UI de Tienda/listado de
// productos). Separado de updateProductSchema porque es una acción de un
// solo campo, no una edición general del producto.
export const publishProductSchema = z.object({
  publishedToStore: z.boolean(),
});

// Bulk JSON / CSV: sigue con `category` (nombre, texto libre) — find-or-create
// vía resolveCategoryId en productsService.ts. No tiene UI de dropdown.
const bulkProductSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.coerce.number().nonnegative("El precio no puede ser negativo"),
  description: z.string().optional(),
  category: z.string().min(1, "La categoría es requerida"),
  image: z.string().optional(),
  quantity: z.coerce.number().int().nonnegative("La cantidad no puede ser negativa"),
});
export const bulkProductsSchema = z.array(bulkProductSchema).min(1);

// ---------- Clientes ----------
export const createCustomerSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.email().or(z.literal("")).optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  taxCondition: z.string().optional(),
  address: z.string().optional(),
});
export const updateCustomerSchema = createCustomerSchema.partial();

// ---------- Ventas ----------
const saleProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().optional(),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a 0"),
  price: z.coerce.number().nonnegative(),
  category: z.string().optional(),
});
export const createSaleSchema = z.object({
  products: z.array(saleProductSchema).min(1, "La venta debe tener al menos un producto"),
});

// ---------- Órdenes ----------
const orderProductSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
});
export const createOrderSchema = z.object({
  customer: z.string().min(1, "El cliente es requerido"),
  products: z.array(orderProductSchema).optional(),
  totalAmount: z.coerce.number().optional(),
  type: z.enum(["sale", "purchase"]),
  quotationId: z.string().nullable().optional(),
});
export const updateOrderStatusSchema = z.object({
  status: z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase() : v),
    z.enum(["PENDING", "COMPLETED", "CANCELLED"]),
  ),
});
export const updateOrderSchema = z.object({
  products: z.array(orderProductSchema).min(1),
  totalAmount: z.coerce.number(),
  customer: z.string().optional(),
});

// ---------- Presupuestos ----------
const quotationProductSchema = z.object({
  product: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
});
export const createQuotationSchema = z.object({
  customer: z.string().min(1, "El cliente es requerido"),
  products: z.array(quotationProductSchema).min(1),
  totalAmount: z.coerce.number(),
  validUntil: z.string().min(1),
});
export const updateQuotationSchema = z.object({
  products: z.array(quotationProductSchema).min(1),
  totalAmount: z.coerce.number(),
  validUntil: z.string().min(1),
});

// ---------- Comprobantes ----------
export const createReceiptSchema = z.object({
  relatedDocument: z.string().min(1),
});

// ---------- Facturación de servicios ----------
// Conceptos libres (sin productId): a diferencia de Sale/Quotation, una
// Invoice factura servicios, no productos de stock.
export const invoiceItemSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0"),
  unitPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().default(21),
});
export const createInvoiceSchema = z.object({
  customerId: z.string().min(1, "El cliente es requerido"),
  items: z.array(invoiceItemSchema).min(1, "La factura debe tener al menos un ítem"),
  dueDate: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export const updateInvoiceSchema = z.object({
  customerId: z.string().min(1).optional(),
  items: z.array(invoiceItemSchema).min(1, "La factura debe tener al menos un ítem"),
  dueDate: z.string().min(1).optional(),
  notes: z.string().optional(),
});

// ---------- Facturar desde venta ----------
// Body del endpoint POST /sales/:saleId/invoice. Los ítems se mapean de la
// venta (SaleItem → InvoiceLineInput con taxRate 21%); el body solo pide
// el cliente de facturación, vencimiento opcional y notas.
export const createSaleInvoiceSchema = z.object({
  customerId: z.string().min(1, "El cliente es requerido"),
  dueDate: z.string().min(1).optional(),
  notes: z.string().optional(),
});

// ---------- Tienda online (checkout público) ----------
// Sin precios en el payload: el endpoint SIEMPRE recalcula desde la DB (ver
// storeController.checkout). El cliente solo manda productId + cantidad.
const checkoutItemSchema = z.object({
  productId: z.string().min(1, "productId es requerido"),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a 0"),
});
export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().min(1, "El nombre es requerido"),
    email: z.email("Email inválido"),
    phone: z.string().min(1, "El teléfono es requerido"),
  }),
  items: z.array(checkoutItemSchema).min(1, "El carrito está vacío"),
});

// ---------- Tienda online (config ERP, WS4) ----------
// Badges configurables de confianza (envío gratis, garantía, etc.) — máximo 3
// (decisión de diseño: barra de confianza, no reviews/stars).
const storeBadgeSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  subtitle: z.string().min(1, "El subtítulo es requerido"),
});
export const updateStoreSettingsSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (formato #rrggbb)")
    .optional(),
  logoUrl: z.string().url("URL de logo inválida").nullable().optional(),
  bannerUrl: z.string().url("URL de banner inválida").nullable().optional(),
  tagline: z.string().nullable().optional(),
  showNewsletter: z.boolean().optional(),
  showBanner: z.boolean().optional(),
  badges: z.array(storeBadgeSchema).max(3, "Máximo 3 badges").nullable().optional(),
  contactEmail: z.email("Email inválido").nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});
