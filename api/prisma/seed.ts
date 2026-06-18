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
    update: {},
    create: { name: "Negocio Demo", slug: "demo" },
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
    { name: "Laptop HP Pavilion 15", price: 45999.99, description: "Intel i5, 8GB RAM, 512GB SSD", category: "Electrónica", quantity: 15 },
    { name: "Mouse Logitech MX Master 3", price: 5999.0, description: "Mouse inalámbrico ergonómico", category: "Electrónica", quantity: 45 },
    { name: "Teclado Mecánico RGB", price: 8500.5, description: "Switches blue retroiluminado", category: "Electrónica", quantity: 30 },
    { name: "Monitor Samsung 27\"", price: 18999.99, description: "Full HD 75Hz", category: "Electrónica", quantity: 20 },
    { name: "Silla Ergonómica", price: 12500.0, description: "Soporte lumbar ajustable", category: "Oficina", quantity: 25 },
    { name: "Escritorio de Madera", price: 28000.0, description: "Madera maciza 150x80cm", category: "Oficina", quantity: 10 },
    { name: "Cafetera Express", price: 15999.0, description: "Automática 19 bares", category: "Hogar", quantity: 12 },
    { name: "Taladro Inalámbrico", price: 8999.0, description: "20V con 2 baterías", category: "Herramientas", quantity: 18 },
    { name: "Auriculares Bluetooth", price: 4999.0, description: "Cancelación de ruido", category: "Electrónica", quantity: 55 },
    { name: "Cargador USB-C 65W", price: 1500.0, description: "Carga rápida para laptops", category: "Accesorios", quantity: 60 },
  ];
  const products = await prisma.product.createMany({
    data: baseProducts.map((p) => ({
      ...p,
      image: "/uploads/placeholder.jpg",
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
