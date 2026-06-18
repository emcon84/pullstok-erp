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

// ---------- Plataforma / usuarios ----------
export const createOrganizationSchema = z.object({
  organizationName: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug: solo minúsculas, números y guiones"),
  adminEmail: z.email(),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
});

// ---------- Productos ----------
export const createProductSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.coerce.number().nonnegative("El precio no puede ser negativo"),
  description: z.string().optional(),
  category: z.string().min(1, "La categoría es requerida"),
  image: z.string().optional(),
  quantity: z.coerce.number().int().nonnegative("La cantidad no puede ser negativa"),
});
export const updateProductSchema = createProductSchema.partial();
export const bulkProductsSchema = z.array(createProductSchema).min(1);

// ---------- Clientes ----------
export const createCustomerSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.email(),
  phone: z.string().optional(),
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
