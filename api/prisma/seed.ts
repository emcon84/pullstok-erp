import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1) SUPERADMIN (la plataforma — sin organización)
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";
  await prisma.user.upsert({
    where: { email: superadminEmail },
    update: {},
    create: {
      email: superadminEmail,
      password: await bcrypt.hash(superadminPassword, 10),
      role: Role.SUPERADMIN,
      mustChangePassword: false,
      organizationId: null,
    },
  });
  console.log(`✅ SUPERADMIN: ${superadminEmail} / ${superadminPassword}`);

  // 2) Organización demo + su ADMIN
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: { onboardingCompletedAt: new Date() },
    create: { name: "Negocio Demo", slug: "demo", onboardingCompletedAt: new Date() },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@demo.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      role: Role.ADMIN,
      mustChangePassword: false,
      organizationId: org.id,
    },
  });
  console.log(`✅ ADMIN (org demo): ${adminEmail} / ${adminPassword}`);

  // 3) Root categories (8 pet-shop roots seeded once)
  const ROOT_CATEGORIES = [
    "ALIMENTACIÓN Y NUTRICIÓN",
    "FARMACIA SALUD Y CUIDADOS",
    "DESCANSO Y HOGAR",
    "ACCESORIOS Y PASEO",
    "ESTÉTICA E HIGIENE",
    "JUGUETES",
    "INDUMENTARIA Y SEGURIDAD",
    "IMPORTADOS",
  ];
  for (const name of ROOT_CATEGORIES) {
    await prisma.category.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { name, organizationId: org.id },
    });
  }
  console.log(`✅ ${ROOT_CATEGORIES.length} categorías raíz creadas`);

  // 4) Child category "Collares" under "ACCESORIOS Y PASEO"
  const accesorios = await prisma.category.findFirst({
    where: { organizationId: org.id, name: "ACCESORIOS Y PASEO" },
  });
  if (accesorios) {
    const collares = await prisma.category.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "Collares" } },
      update: { parentId: accesorios.id },
      create: { name: "Collares", organizationId: org.id, parentId: accesorios.id },
    });
    console.log(`✅ Categoría hija "Collares" creada bajo "ACCESORIOS Y PASEO"`);

    // Variant definitions for Collares
    const talleDef = await prisma.categoryVariantDefinition.upsert({
      where: { categoryId_name: { categoryId: collares.id, name: "Talle" } },
      update: {},
      create: { categoryId: collares.id, name: "Talle", organizationId: org.id },
    });
    const talleOptions = [
      { variantId: talleDef.id, value: "S", organizationId: org.id },
      { variantId: talleDef.id, value: "M", organizationId: org.id },
      { variantId: talleDef.id, value: "L", organizationId: org.id },
    ];
    for (const opt of talleOptions) {
      await prisma.categoryVariantOption.upsert({
        where: { variantId_value: { variantId: talleDef.id, value: opt.value } },
        update: {},
        create: opt,
      });
    }

    const colorDef = await prisma.categoryVariantDefinition.upsert({
      where: { categoryId_name: { categoryId: collares.id, name: "Color" } },
      update: {},
      create: { categoryId: collares.id, name: "Color", organizationId: org.id },
    });
    const colorOptions = [
      { variantId: colorDef.id, value: "Negro", organizationId: org.id },
      { variantId: colorDef.id, value: "Marrón", organizationId: org.id },
      { variantId: colorDef.id, value: "Rojo", organizationId: org.id },
    ];
    for (const opt of colorOptions) {
      await prisma.categoryVariantOption.upsert({
        where: { variantId_value: { variantId: colorDef.id, value: opt.value } },
        update: {},
        create: opt,
      });
    }
    console.log(`✅ Variantes "Talle" (S/M/L) y "Color" (Negro/Marrón/Rojo) creadas para Collares`);
  }

  // 5) Productos demo (scopeados a la org)
  await prisma.product.deleteMany({ where: { organizationId: org.id } });
  const baseProducts = [
    { name: "Laptop HP Pavilion 15", price: 45999.99, description: "Intel i5, 8GB RAM, 512GB SSD", quantity: 15, image: "https://images.pullstok.com/demo_laptop.webp" },
    { name: "Mouse Logitech MX Master 3", price: 5999.0, description: "Mouse inalámbrico ergonómico", quantity: 45, image: "https://images.pullstok.com/demo_mouse.webp" },
    { name: "Teclado Mecánico RGB", price: 8500.5, description: "Switches blue retroiluminado", quantity: 30, image: "https://images.pullstok.com/demo_teclado.webp" },
    { name: "Monitor Samsung 27\"", price: 18999.99, description: "Full HD 75Hz", quantity: 20, image: "https://images.pullstok.com/demo_monitor.webp" },
    { name: "Silla Ergonómica", price: 12500.0, description: "Soporte lumbar ajustable", quantity: 25, image: "https://images.pullstok.com/demo_silla.webp" },
    { name: "Escritorio de Madera", price: 28000.0, description: "Madera maciza 150x80cm", quantity: 10, image: "https://images.pullstok.com/demo_escritorio.webp" },
    { name: "Cafetera Express", price: 15999.0, description: "Automática 19 bares", quantity: 12, image: "https://images.pullstok.com/demo_cafetera.webp" },
    { name: "Taladro Inalámbrico", price: 8999.0, description: "20V con 2 baterías", quantity: 18, image: "https://images.pullstok.com/demo_taladro.webp" },
    { name: "Auriculares Bluetooth", price: 4999.0, description: "Cancelación de ruido", quantity: 55, image: "https://images.pullstok.com/demo_auriculares.webp" },
    { name: "Cargador USB-C 65W", price: 1500.0, description: "Carga rápida para laptops", quantity: 60, image: "https://images.pullstok.com/demo_cargador.webp" },
  ];
  const products = await prisma.product.createMany({
    data: baseProducts.map((p) => ({
      ...p,
      publishedToStore: true, // demo: catálogo siempre visible en la tienda pública
      organizationId: org.id,
    })),
  });
  console.log(`✅ ${products.count} productos demo creados`);

  // 6) Clientes demo (scopeados a la org)
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  const customers = await prisma.customer.createMany({
    data: [
      { name: "Juan Pérez", email: "juan.perez@example.com", phone: "+54 11 1234 5678", organizationId: org.id },
      { name: "María García", email: "maria.garcia@example.com", phone: "+54 11 8765 4321", organizationId: org.id },
      { name: "Carlos López", email: "carlos.lopez@example.com", phone: "+54 11 2468 1357", organizationId: org.id },
    ],
  });
  console.log(`✅ ${customers.count} clientes demo creados`);

  console.log("\n🎉 Base de datos inicializada!");
}

main()
  .catch((e) => {
    console.error("❌ Error al inicializar la base de datos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
