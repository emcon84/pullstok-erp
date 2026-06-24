import { Response } from "express";
import { basePrisma, prisma } from "../config/db";
import { PublicStoreRequest } from "../middlewares/tenantBySlug";
import { requireOrganizationId } from "../config/tenantContext";

// Defaults cuando la organización todavía no configuró su StoreSettings
// (StoreSettings es 1:1 y NO está en TENANT_MODELS — se lee directo por
// organizationId vía basePrisma, sin pasar por la extensión anti-fuga).
const DEFAULT_PRIMARY_COLOR = "#6d28d9";

// Catálogo público: SOLO productos publicados (publishedToStore=true) de la
// organización resuelta por tenantBySlug. El scope por organización lo pone
// la extensión anti-fuga de Prisma (corre dentro de runWithTenant); acá solo
// agregamos el filtro de publicación.
//
// Búsqueda server-side opcional (?q=...): case-insensitive sobre name +
// description, siempre dentro del mismo scope (publishedToStore + tenant).
// No es full-text search dedicado (sin índice GIN) — alcanza para v1, el
// catálogo de una org chica/mediana no necesita más que esto.
//
// Shape de respuesta pensado para el storefront (Astro): id, name, price,
// image, quantity (para mostrar "sin stock" sin ocultar el producto — ver
// spec "Out-of-stock product still visible"), description.
const getProducts = async (req: PublicStoreRequest, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const products = await prisma.product.findMany({
      where: {
        publishedToStore: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        price: true,
        description: true,
        image: true,
        quantity: true,
      },
      orderBy: { name: "asc" },
    });
    res.status(200).json(products);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Detalle público de un producto. 404 tanto si no existe como si existe pero
// no está publicado (publishedToStore=false) — la spec exige que ambos casos
// sean indistinguibles desde afuera (no revelar que el producto "existe pero
// está oculto").
const getProductById = async (req: PublicStoreRequest, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, publishedToStore: true },
      select: {
        id: true,
        name: true,
        price: true,
        description: true,
        image: true,
        quantity: true,
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Not found" });
    }

    res.status(200).json(product);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Branding público de la tienda. StoreSettings es 1:1 con Organization y no
// está scopeada por la extensión anti-fuga (no es TENANT_MODEL) — se busca
// directo por organizationId con basePrisma. Si la org nunca configuró nada,
// se devuelven defaults sensatos en vez de 404 (la tienda nunca debe romperse
// por falta de configuración — ver spec "Defaults when unconfigured").
const getSettings = async (req: PublicStoreRequest, res: Response) => {
  try {
    const org = req.org!;
    const settings = await basePrisma.storeSettings.findUnique({
      where: { organizationId: org.id },
    });

    res.status(200).json({
      storeName: org.name,
      primaryColor: settings?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      logoUrl: settings?.logoUrl ?? null,
      bannerUrl: settings?.bannerUrl ?? null,
      tagline: settings?.tagline ?? null,
      showNewsletter: settings?.showNewsletter ?? true,
      showBanner: settings?.showBanner ?? true,
      // Badges configurables (envío gratis, garantía, etc.) — null/vacío si
      // la org no configuró nada; el storefront oculta la barra en ese caso.
      badges: (settings?.badges as { title: string; subtitle: string }[] | null) ?? null,
      contactEmail: settings?.contactEmail ?? null,
      contactPhone: settings?.contactPhone ?? null,
      address: settings?.address ?? null,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Error tipado para distinguir "stock insuficiente" de otros fallos de la
// transacción (permite responder 409 con el nombre del producto en vez de
// un 500 genérico).
class InsufficientStockError extends Error {
  constructor(public productName: string, public available: number) {
    super(`Stock insuficiente para "${productName}" (disponible: ${available})`);
  }
}

// Checkout público: SIEMPRE recalcula precios/stock desde la DB dentro de
// una transacción SERIALIZABLE — nunca confía en lo que mande el cliente
// (ver decisión de diseño: el admin orderController NO se reutiliza porque
// confía en precios del body). No descuenta stock acá (lo hace una Sale
// posterior del lado admin); esta transacción solo VALIDA disponibilidad al
// momento de crear la Order (decisión locked: sin reserva de stock en v1).
const checkout = async (req: PublicStoreRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { customer, items } = req.body as {
      customer: { name: string; email: string; phone: string };
      items: { productId: string; quantity: number }[];
    };

    const result = await prisma.$transaction(
      async (tx) => {
        // Re-fetch tenant-scoped y solo productos publicados: un producto
        // despublicado entre el GET del catálogo y el submit del checkout
        // no debe poder comprarse (mismo criterio que getProductById).
        const productIds = items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, publishedToStore: true },
        });
        const productsById = new Map(products.map((p) => [p.id, p]));

        // Todos los productos referenciados deben existir y estar publicados.
        for (const item of items) {
          if (!productsById.has(item.productId)) {
            throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
          }
        }

        // Validar stock disponible por línea ANTES de crear nada — si una
        // sola línea no alcanza, se aborta todo (no fulfillment parcial).
        for (const item of items) {
          const product = productsById.get(item.productId)!;
          if (item.quantity > product.quantity) {
            throw new InsufficientStockError(product.name, product.quantity);
          }
        }

        // Precios/totales SIEMPRE desde la DB, nunca del body (anti price
        // tampering — defensa en profundidad: el Zod schema ni siquiera
        // acepta un campo "price" en items, pero esto es la garantía real).
        const orderItemsData = items.map((item) => {
          const product = productsById.get(item.productId)!;
          return {
            productId: product.id,
            quantity: item.quantity,
            price: product.price,
          };
        });
        const totalAmount = orderItemsData.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0,
        );

        // Customer upsert manual por (organizationId, email) — el extends
        // anti-fuga de db.ts bloquea upsert/update/findUnique en modelos
        // tenant (Customer lo es), así que se hace findFirst + create /
        // updateMany explícito (mismo patrón que el resto del codebase).
        const existingCustomer = await tx.customer.findFirst({
          where: { email: customer.email },
        });

        let customerId: string;
        if (existingCustomer) {
          await tx.customer.updateMany({
            where: { email: customer.email },
            data: { name: customer.name, phone: customer.phone },
          });
          customerId = existingCustomer.id;
        } else {
          const created = await tx.customer.create({
            data: {
              organizationId,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            },
          });
          customerId = created.id;
        }

        const order = await tx.order.create({
          data: {
            organizationId,
            customerId,
            totalAmount,
            status: "PENDING",
            type: "SALE",
            source: "STORE",
            items: { create: orderItemsData },
          },
          include: { items: true, customer: true },
        });

        return order;
      },
      { isolationLevel: "Serializable" },
    );

    res.status(201).json({
      orderId: result.id,
      total: result.totalAmount,
      items: result.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
      })),
      customer: {
        name: result.customer.name,
        email: result.customer.email,
        phone: result.customer.phone,
      },
    });
  } catch (error: any) {
    if (error instanceof InsufficientStockError) {
      return res.status(409).json({ message: error.message });
    }
    if (typeof error?.message === "string" && error.message.startsWith("PRODUCT_NOT_FOUND:")) {
      return res.status(400).json({ message: "Uno o más productos no existen o no están disponibles" });
    }
    res.status(500).json({ message: error.message });
  }
};

export default {
  getProducts,
  getProductById,
  getSettings,
  checkout,
};
