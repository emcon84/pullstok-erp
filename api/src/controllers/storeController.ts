import { Response } from "express";
import { basePrisma, prisma } from "../config/db";
import { PublicStoreRequest } from "../middlewares/tenantBySlug";

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

export default {
  getProducts,
  getProductById,
  getSettings,
};
