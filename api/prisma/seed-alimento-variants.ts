import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Variants to add per category ──
// Path: RAÍZ > parent > leaf category
// We find by org + name + parent, then add variant defs + options

interface VariantDef {
  name: string;
  options: string[];
}

const SECO_VARIANTS: VariantDef[] = [
  { name: "Marca", options: ["Bonelo", "Cat Chow", "Dog Chow", "ProPlan", "Excellent", "Gati", "Dentalife", "Dogui", "Bonzo"] },
  { name: "Segmento", options: ["Premium", "Mainstream", "Super Premium", "Lower Super Premium", "Natural"] },
  { name: "Tamaño", options: ["1 KG", "3 KG", "7.5 KG", "12 KG", "15 KG", "20 KG", "21 KG", "24 KG"] },
  { name: "Etapa", options: ["Adulto", "Cachorro", "Senior", "Esterilizado", "Gatito"] },
];

const HUMEDO_VARIANTS: VariantDef[] = [
  { name: "Marca", options: ["Cat Chow", "Dog Chow", "ProPlan"] },
  { name: "Formato", options: ["Lata", "Sobre 100g", "Pack 15x85g", "Pack 15x100g"] },
  { name: "Sabor", options: ["Pollo", "Carne", "Pavo", "Pescado", "Mixto"] },
];

const PIEDRAS_VARIANTS: VariantDef[] = [
  { name: "Marca", options: ["Tidy Cats"] },
  { name: "Tamaño", options: ["1.8 KG", "3.6 KG"] },
];

// ── Target categories ──
const TARGETS = [
  { root: "ALIMENTACIÓN Y NUTRICIÓN", parent: "Perros", leaf: "Alimento Seco (Balanceado)", variants: SECO_VARIANTS },
  { root: "ALIMENTACIÓN Y NUTRICIÓN", parent: "Gatos", leaf: "Alimento Seco (Balanceado)", variants: SECO_VARIANTS },
  { root: "ALIMENTACIÓN Y NUTRICIÓN", parent: "Perros", leaf: "Alimento Húmedo (Latas / Sobres)", variants: HUMEDO_VARIANTS },
  { root: "ALIMENTACIÓN Y NUTRICIÓN", parent: "Gatos", leaf: "Alimento Húmedo (Pouch / Latas)", variants: HUMEDO_VARIANTS },
  { root: "ESTÉTICA E HIGIENE", parent: null as string | null, leaf: "Piedras y Sanitarios para Gatos", variants: PIEDRAS_VARIANTS },
];

async function addVariants(orgId: string, orgName: string) {
  console.log(`\n📦 ${orgName}`);

  for (const target of TARGETS) {
    // Find the root category
    const root = await prisma.category.findFirst({
      where: { organizationId: orgId, name: target.root, parentId: null },
    });
    if (!root) { console.log(`  ⚠ Root "${target.root}" not found`); continue; }

    // Find parent (or use root directly)
    let parentId = root.id;
    if (target.parent) {
      const parent = await prisma.category.findFirst({
        where: { organizationId: orgId, name: target.parent, parentId: root.id },
      });
      if (!parent) { console.log(`  ⚠ Parent "${target.parent}" not found under "${target.root}"`); continue; }
      parentId = parent.id;
    }

    // Find leaf
    let leafWhere: any = { organizationId: orgId, name: target.leaf, parentId };
    const leaf = await prisma.category.findFirst({ where: leafWhere });
    if (!leaf) { console.log(`  ⚠ Leaf "${target.leaf}" not found`); continue; }

    console.log(`  ✅ ${target.root} > ${target.parent || ""} > ${target.leaf}`);

    let addedCount = 0;
    for (const v of target.variants) {
      // Check if variant already exists
      let def = await prisma.categoryVariantDefinition.findFirst({
        where: { categoryId: leaf.id, name: v.name },
      });
      if (!def) {
        def = await prisma.categoryVariantDefinition.create({
          data: { categoryId: leaf.id, name: v.name, organizationId: orgId },
        });
        addedCount++;
      }

      for (const opt of v.options) {
        await prisma.categoryVariantOption.upsert({
          where: { variantId_value: { variantId: def.id, value: opt } },
          update: {},
          create: { variantId: def.id, value: opt, organizationId: orgId },
        });
      }
    }
    if (addedCount > 0) console.log(`    +${addedCount} nuevas variantes`);
  }
}

async function main() {
  // Demo org
  const demo = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (demo) await addVariants(demo.id, demo.name);

  // El Almacen
  const almacen = await prisma.organization.findUnique({
    where: { id: "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b" },
  });
  if (almacen) await addVariants(almacen.id, almacen.name);

  console.log("\n✅ Done!");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
