import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_SLUG = "demo";
const DEMO_ORG_NAME = "Negocio Demo";
const DEMO_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@demo.com";
const DEMO_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

// Mismos datos exactos que prisma/seed.ts — mantener en sync si seed.ts cambia.
const DEMO_PRODUCTS = [
  { name: "Laptop HP Pavilion 15", price: 45999.99, description: "Intel i5, 8GB RAM, 512GB SSD", quantity: 15 },
  { name: "Mouse Logitech MX Master 3", price: 5999.0, description: "Mouse inalámbrico ergonómico", quantity: 45 },
  { name: "Teclado Mecánico RGB", price: 8500.5, description: "Switches blue retroiluminado", quantity: 30 },
  { name: "Monitor Samsung 27\"", price: 18999.99, description: "Full HD 75Hz", quantity: 20 },
  { name: "Silla Ergonómica", price: 12500.0, description: "Soporte lumbar ajustable", quantity: 25 },
  { name: "Escritorio de Madera", price: 28000.0, description: "Madera maciza 150x80cm", quantity: 10 },
  { name: "Cafetera Express", price: 15999.0, description: "Automática 19 bares", quantity: 12 },
  { name: "Taladro Inalámbrico", price: 8999.0, description: "20V con 2 baterías", quantity: 18 },
  { name: "Auriculares Bluetooth", price: 4999.0, description: "Cancelación de ruido", quantity: 55 },
  { name: "Cargador USB-C 65W", price: 1500.0, description: "Carga rápida para laptops", quantity: 60 },
];

const DEMO_CUSTOMERS = [
  { name: "Juan Pérez", email: "juan.perez@example.com", phone: "+54 11 1234 5678" },
  { name: "María García", email: "maria.garcia@example.com", phone: "+54 11 8765 4321" },
  { name: "Carlos López", email: "carlos.lopez@example.com", phone: "+54 11 2468 1357" },
];

async function main() {
  console.log("🔄 Reseteando organización demo...");

  // 1) Upsert de la organización demo (existe siempre, incluso si un visitante la borró).
  const org = await prisma.organization.upsert({
    where: { slug: DEMO_SLUG },
    update: { name: DEMO_ORG_NAME, isActive: true, onboardingCompletedAt: new Date() },
    create: { name: DEMO_ORG_NAME, slug: DEMO_SLUG, onboardingCompletedAt: new Date() },
  });
  console.log(`✅ Organización demo OK (id: ${org.id})`);

  // 2) Reset del usuario ADMIN demo: email + password + role fijos.
  //    Si un visitante cambió el email del admin original, lo recuperamos buscando
  //    por org+role en vez de asumir que admin@demo.com sigue apuntando al mismo user.
  const hashedPassword = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);

  const existingAdminByEmail = await prisma.user.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
  });

  if (existingAdminByEmail && existingAdminByEmail.organizationId === org.id) {
    // Caso normal: el admin demo sigue con su email correcto.
    await prisma.user.update({
      where: { id: existingAdminByEmail.id },
      data: {
        password: hashedPassword,
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: false,
        organizationId: org.id,
      },
    });
  } else {
    // El email admin@demo.com no existe o pertenece a otra org/usuario.
    // Buscamos algún ADMIN existente de la org demo para recuperar su acceso;
    // si no hay ninguno, creamos uno nuevo.
    const orgAdmin = await prisma.user.findFirst({
      where: { organizationId: org.id, role: Role.ADMIN },
    });

    if (orgAdmin) {
      await prisma.user.update({
        where: { id: orgAdmin.id },
        data: {
          email: DEMO_ADMIN_EMAIL,
          password: hashedPassword,
          role: Role.ADMIN,
          isActive: true,
          mustChangePassword: false,
          organizationId: org.id,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          email: DEMO_ADMIN_EMAIL,
          password: hashedPassword,
          role: Role.ADMIN,
          isActive: true,
          mustChangePassword: false,
          organizationId: org.id,
        },
      });
    }
  }
  console.log(`✅ ADMIN demo restaurado: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);

  // 3) Borrado de datos transaccionales, respetando FKs.
  //    OrderItem/QuotationItem/SaleItem tienen onDelete: Cascade desde su padre,
  //    así que borrar Order/Quotation/Sale ya borra sus items.
  //    Pero hay que borrar esos padres ANTES de borrar Product/Customer,
  //    porque OrderItem/QuotationItem/SaleItem referencian productId sin cascade.
  const deletedOrders = await prisma.order.deleteMany({ where: { organizationId: org.id } });
  const deletedQuotations = await prisma.quotation.deleteMany({ where: { organizationId: org.id } });
  const deletedSales = await prisma.sale.deleteMany({ where: { organizationId: org.id } });
  const deletedReceipts = await prisma.receipt.deleteMany({ where: { organizationId: org.id } });

  // Counters: no se borran (son @@unique por org+name y se reusan), se resetean a 0.
  const resetCounters = await prisma.counter.updateMany({
    where: { organizationId: org.id },
    data: { sequenceValue: 0 },
  });

  console.log(
    `✅ Datos transaccionales limpiados: ${deletedOrders.count} órdenes, ${deletedQuotations.count} cotizaciones, ${deletedSales.count} ventas, ${deletedReceipts.count} comprobantes, ${resetCounters.count} contadores reseteados a 0`
  );

  // 4) Productos y clientes demo: borrar y recrear exactamente como en seed.ts.
  //    Ahora que no quedan Order/Quotation/Sale items colgando, se puede borrar Product sin violar FK.
  await prisma.product.deleteMany({ where: { organizationId: org.id } });
  const products = await prisma.product.createMany({
    data: DEMO_PRODUCTS.map((p) => ({
      ...p,
      image: "/uploads/placeholder.jpg",
      organizationId: org.id,
    })),
  });
  console.log(`✅ ${products.count} productos demo recreados`);

  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  const customers = await prisma.customer.createMany({
    data: DEMO_CUSTOMERS.map((c) => ({
      ...c,
      organizationId: org.id,
    })),
  });
  console.log(`✅ ${customers.count} clientes demo recreados`);

  console.log("\n🎉 Organización demo restaurada a su estado inicial.");
}

main()
  .catch((e) => {
    console.error("❌ Error al resetear la organización demo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
