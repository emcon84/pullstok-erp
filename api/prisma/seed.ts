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

  // 3) Productos demo (scopeados a la org)
  await prisma.product.deleteMany({ where: { organizationId: org.id } });
  const baseProducts = [
    { name: "Laptop HP Pavilion 15", price: 45999.99, description: "Intel i5, 8GB RAM, 512GB SSD", quantity: 15, image: "https://images.pullstok.com/products_5d01285d-248e-484f-ad76-f4de29c1aba0.webp" },
    { name: "Mouse Logitech MX Master 3", price: 5999.0, description: "Mouse inalámbrico ergonómico", quantity: 45, image: "https://images.pullstok.com/products_5517bec1-a338-4bab-8917-d564b23525d5.webp" },
    { name: "Teclado Mecánico RGB", price: 8500.5, description: "Switches blue retroiluminado", quantity: 30, image: "https://images.pullstok.com/products_2e12ef30-7f54-4234-ac67-a76b982a7a47.webp" },
    { name: "Monitor Samsung 27\"", price: 18999.99, description: "Full HD 75Hz", quantity: 20, image: "https://images.pullstok.com/products_3355838e-5faa-42f5-be40-a63e6af19e36.webp" },
    { name: "Silla Ergonómica", price: 12500.0, description: "Soporte lumbar ajustable", quantity: 25, image: "https://images.pullstok.com/products_8a0758e7-b00f-4f6d-afd3-a3dfdc64e7d2.webp" },
    { name: "Escritorio de Madera", price: 28000.0, description: "Madera maciza 150x80cm", quantity: 10, image: "https://images.pullstok.com/products_4e321ebd-60a2-40ee-9cba-5255ce18a43d.webp" },
    { name: "Cafetera Express", price: 15999.0, description: "Automática 19 bares", quantity: 12, image: "https://images.pullstok.com/products_cc877f72-577f-4ed3-99f7-66abfe473175.webp" },
    { name: "Taladro Inalámbrico", price: 8999.0, description: "20V con 2 baterías", quantity: 18, image: "https://images.pullstok.com/products_60ba2528-5804-491c-a5bd-c070631aff63.webp" },
    { name: "Auriculares Bluetooth", price: 4999.0, description: "Cancelación de ruido", quantity: 55, image: "https://images.pullstok.com/products_170617ca-bb11-4cbf-bccb-d4e2279936e2.webp" },
    { name: "Cargador USB-C 65W", price: 1500.0, description: "Carga rápida para laptops", quantity: 60, image: "https://images.pullstok.com/products_73ea95d0-2932-447a-a560-14cce41e6aca.webp" },
  ];
  const products = await prisma.product.createMany({
    data: baseProducts.map((p) => ({
      ...p,
      organizationId: org.id,
    })),
  });
  console.log(`✅ ${products.count} productos demo creados`);

  // 4) Clientes demo (scopeados a la org)
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
