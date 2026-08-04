import { z } from "zod";

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.string().min(1, "Email o usuario es requerido"),
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

// ---------- Password Recovery ----------
export const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token requerido"),
  newPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
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
  parentId: z.string().uuid().optional(),
});
export const createCategorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  parentId: z.string().uuid().optional(),
});
export const updateCategorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido").optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// ---------- Variant Definitions ----------
export const createVariantSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  sortOrder: z.number().int().optional(),
});
export const updateVariantSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").optional(),
  sortOrder: z.number().int().optional(),
});

// ---------- Variant Options ----------
export const createVariantOptionSchema = z.object({
  value: z.string().min(1, "El valor es requerido"),
  sortOrder: z.number().int().optional(),
});
export const updateVariantOptionSchema = z.object({
  value: z.string().min(1, "El valor es requerido").optional(),
  sortOrder: z.number().int().optional(),
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

const orgRoles = ["ADMIN", "EMPLOYEE", "VENDEDOR", "CASHIER", "MANAGEMENT"] as const;

export const createUserSchema = z
  .object({
    email: z.string().email().optional(),
    username: z
      .string()
      .min(3, "El usuario debe tener al menos 3 caracteres")
      .regex(
        /^[a-z0-9._-]+$/,
        "Usuario: solo minúsculas, números, puntos, guiones y guiones bajos",
      )
      .optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres"),
    role: z.enum(orgRoles).optional(),
    branchIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.email || data.username, {
    message: "Se requiere email o nombre de usuario",
    path: ["email"],
  })
  .refine(
    (data) => {
      // Si se proporciona email, validar que sea un email real
      if (data.email && !data.email.includes("@")) {
        return false;
      }
      return true;
    },
    { message: "Email inválido", path: ["email"] },
  );

// SUPERADMIN create user: same as createUserSchema but role is explicit (no SUPERADMIN)
export const superadminCreateUserSchema = createUserSchema;

// ---------- Productos ----------
// Alta manual single (form de la UI): exige categoryId real, elegido de un
// <select> poblado con GET /categories. El controller valida que pertenezca a
// la organización actual antes de crear el producto (decisión #467 — evita
// que texto libre ensucie el catálogo y evita fuga cross-tenant de categoryId).
export const createProductSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.coerce.number().nonnegative("El precio no puede ser negativo"),
  code: z.string().optional(), // Código de barras / SKU
  barcode: z.string().nullable().optional(), // EAN-13 / UPC escaneado
  description: z.string().optional(),
  categoryId: z.string().min(1, "La categoría es requerida"),
  image: z.string().optional(),
  quantity: z.coerce.number().int().nonnegative("La cantidad no puede ser negativa"),
  // Visibilidad en la tienda online (WS4). Opcional en alta/edición general;
  // el toggle dedicado de la UI usa publishProductSchema (PATCH /publish).
  publishedToStore: z.boolean().optional(),
  // Variant option IDs (categories-variants-redesign). Array de UUIDs de
  // CategoryVariantOption. El controller valida pertenencia a la categoría.
  variantOptionIds: z.array(z.string().uuid()).optional(),
});
// En edición, categoryId puede venir null: un producto sin categoría es válido
// (la FK es nullable en la DB). createProductSchema lo exige string min(1), así
// que lo sobrescribimos para aceptar null (desasignar) o string válido.
export const updateProductSchema = createProductSchema.partial().extend({
  categoryId: z
    .string()
    .min(1, "La categoría es requerida")
    .nullable()
    .optional(),
  variantOptionIds: z.array(z.string().uuid()).optional(),
});

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
  variantOptionIds: z.array(z.string().uuid()).optional(),
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
  // Opcional: si la venta se genera procesando un pedido de la tienda online,
  // apunta a esa Order. La venta la marca COMPLETED y dispara el mail de
  // "compra confirmada" al cliente (ver salesService.createSale).
  orderId: z.string().min(1).optional(),
});

// ---------- Órdenes ----------
const orderProductSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
});
export const createOrderSchema = z.object({
  // customer opcional: el flujo de venta de mostrador (VendorDashboard) guarda
  // pedidos sin cliente cargado; el controller resuelve el genérico
  // "Consumidor final" de la org. Los flujos ERP (Orders view / presupuesto)
  // siempre mandan customer.
  customer: z.string().min(1, "El cliente es requerido").optional(),
  products: z.array(orderProductSchema).optional(),
  totalAmount: z.coerce.number().optional(),
  type: z.enum(["sale", "purchase"]),
  quotationId: z.string().nullable().optional(),
  // Sucursal del flujo vendor (VendorDashboard). null en pedidos ERP org-wide.
  branchId: z.string().optional(),
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
  // Sucursal que la tienda online usa para disponibilidad/checkout (spec S1).
  // null = sin configurar → fallback casa central. La columna y el controller
  // llegan en PR 4; el campo queda aceptado en el schema desde acá para no
  // romper contratos del body (Zod lo descarta si viene de otro lado).
  storeBranchId: z.string().nullable().optional(),
});

// ---------- Chat cliente↔operador (FASE A) ----------
// Inicio de conversación desde la tienda pública: el visitante se presenta con
// nombre + email (sin cuenta). El token de invitado se emite en la respuesta.
export const chatStartSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.email("Email inválido"),
});
// Envío de un mensaje (tanto guest como operador). El conversationId NUNCA
// viaja en el body: sale del token (guest) o de la URL + ownership (operador).
export const chatMessageSchema = z.object({
  body: z.string().min(1, "El mensaje no puede estar vacío"),
});

// ---------- Bot IA (config del comercio) ----------
// Config del bot que edita el operador (PUT /api/bot/config). `enabled` y
// `knowledgeBase` son obligatorios (la KB permite vacío). `model` y `dailyLimit`
// son opcionales: si no vienen, caen en los @default del schema.prisma. Caps de
// costo/contexto: KB máx. 8000 chars, dailyLimit entre 0 y 5000.
export const botConfigSchema = z.object({
  enabled: z.boolean(),
  knowledgeBase: z
    .string()
    .max(8000, "La base de conocimiento no puede superar los 8000 caracteres"),
  model: z.string().min(1, "El modelo no puede estar vacío").optional(),
  dailyLimit: z
    .number()
    .int("El límite diario debe ser un número entero")
    .min(0, "El límite diario no puede ser negativo")
    .max(5000, "El límite diario no puede superar 5000")
    .optional(),
});

// ---------- Sucursales ----------
export const createBranchSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

// ---------- Stock por sucursal ----------
// Body del PUT /products/:id/stock/:branchId (spec A2). Coerción numérica +
// entero ≥ 0: quantity -3 o 2.5 → 400 vía validate().
export const updateBranchStockSchema = z.object({
  quantity: z.coerce
    .number()
    .int("La cantidad debe ser un número entero")
    .nonnegative("La cantidad no puede ser negativa"),
});

// ---------- Bulk Price Update ----------
export const bulkPriceUpdateSchema = z.object({
  brandValues: z.array(z.string().min(1)).min(1, "Seleccioná al menos una marca"),
  percentage: z.coerce.number().min(0, "El porcentaje debe ser >= 0").max(500, "Máximo 500%"),
  roundUp: z.boolean().default(false),
  categoryId: z.string().uuid().optional(),
});

// ---------- Branding de la app (ERP) ----------
// Configuración de branding del ERP, 1:1 con Organization.
// Mismo patrón que updateStoreSettingsSchema: hex regex, URL nullable, strip.
export const updateAppBrandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (formato #rrggbb)")
    .optional(),
  logoUrl: z.string().url("URL de logo inválida").nullable().optional(),
  faviconUrl: z.string().url("URL de favicon inválida").nullable().optional(),
  displayName: z.string().max(100, "Máximo 100 caracteres").optional(),
  showDisplayName: z.boolean().optional(),
}).strip();
