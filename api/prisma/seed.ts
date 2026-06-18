import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Crear usuario de prueba
  const hashedPassword = await bcrypt.hash("test123", 10);

  const user = await prisma.user.upsert({
    where: { email: "test@nexo.com" },
    update: {},
    create: {
      email: "test@nexo.com",
      password: hashedPassword,
      isAdmin: true,
    },
  });

  console.log("✅ Usuario de prueba creado:");
  console.log("   Email: test@nexo.com");
  console.log("   Password: test123");
  console.log("   Admin: Sí");

  // Eliminar productos existentes para evitar duplicados
  await prisma.product.deleteMany({});

  // Crear productos de ejemplo variados
  const products = await prisma.product.createMany({
    data: [
      {
        name: "Laptop HP Pavilion 15",
        price: 45999.99,
        description: "Laptop con procesador Intel i5, 8GB RAM, 512GB SSD",
        category: "Electrónica",
        image: "/uploads/placeholder.jpg",
        quantity: 15,
      },
      {
        name: "Mouse Logitech MX Master 3",
        price: 5999.0,
        description: "Mouse inalámbrico ergonómico con 7 botones",
        category: "Electrónica",
        image: "/uploads/placeholder.jpg",
        quantity: 45,
      },
      {
        name: "Teclado Mecánico RGB",
        price: 8500.5,
        description: "Teclado mecánico retroiluminado switches blue",
        category: "Electrónica",
        image: "/uploads/placeholder.jpg",
        quantity: 30,
      },
      {
        name: "Monitor Samsung 27 pulgadas",
        price: 18999.99,
        description: "Monitor Full HD 27 pulgadas 75Hz",
        category: "Electrónica",
        image: "/uploads/placeholder.jpg",
        quantity: 20,
      },
      {
        name: "Silla Ergonómica Oficina",
        price: 12500.0,
        description: "Silla ergonómica con soporte lumbar ajustable",
        category: "Oficina",
        image: "/uploads/placeholder.jpg",
        quantity: 25,
      },
      {
        name: "Escritorio de Madera",
        price: 28000.0,
        description: "Escritorio de madera maciza 150x80cm",
        category: "Oficina",
        image: "/uploads/placeholder.jpg",
        quantity: 10,
      },
      {
        name: "Lámpara LED Escritorio",
        price: 2500.0,
        description: "Lámpara LED regulable con brazo flexible",
        category: "Oficina",
        image: "/uploads/placeholder.jpg",
        quantity: 50,
      },
      {
        name: "Cafetera Express",
        price: 15999.0,
        description: "Cafetera express automática 19 bares",
        category: "Hogar",
        image: "/uploads/placeholder.jpg",
        quantity: 12,
      },
      {
        name: "Aspiradora Robot",
        price: 22999.99,
        description: "Aspiradora robot con mapeo inteligente",
        category: "Hogar",
        image: "/uploads/placeholder.jpg",
        quantity: 8,
      },
      {
        name: "Set de Herramientas",
        price: 4500.0,
        description: "Set completo de herramientas 100 piezas",
        category: "Herramientas",
        image: "/uploads/placeholder.jpg",
        quantity: 35,
      },
      {
        name: "Taladro Inalámbrico",
        price: 8999.0,
        description: "Taladro inalámbrico 20V con 2 baterías",
        category: "Herramientas",
        image: "/uploads/placeholder.jpg",
        quantity: 18,
      },
      {
        name: "Mochila para Laptop",
        price: 3200.0,
        description: "Mochila resistente al agua para laptop 15.6 pulgadas",
        category: "Accesorios",
        image: "/uploads/placeholder.jpg",
        quantity: 40,
      },
      {
        name: "Auriculares Bluetooth",
        price: 4999.0,
        description: "Auriculares inalámbricos con cancelación de ruido",
        category: "Electrónica",
        image: "/uploads/placeholder.jpg",
        quantity: 55,
      },
      {
        name: "Cargador USB-C 65W",
        price: 1500.0,
        description: "Cargador rápido USB-C compatible con laptops",
        category: "Accesorios",
        image: "/uploads/placeholder.jpg",
        quantity: 60,
      },
      {
        name: "Hub USB 3.0 7 Puertos",
        price: 1800.0,
        description: "Hub USB 3.0 con 7 puertos y alimentación",
        category: "Accesorios",
        image: "/uploads/placeholder.jpg",
        quantity: 42,
      },
    ],
  });

  console.log(`✅ ${products.count} productos de prueba creados`);

  // Eliminar clientes existentes para evitar duplicados
  await prisma.customer.deleteMany({});

  // Crear clientes de ejemplo
  const customers = await prisma.customer.createMany({
    data: [
      {
        name: "Juan Pérez",
        email: "juan.perez@example.com",
        phone: "+52 55 1234 5678",
      },
      {
        name: "María García",
        email: "maria.garcia@example.com",
        phone: "+52 55 8765 4321",
      },
      {
        name: "Carlos López",
        email: "carlos.lopez@example.com",
        phone: "+52 55 2468 1357",
      },
      {
        name: "Ana Martínez",
        email: "ana.martinez@example.com",
        phone: "+52 55 9753 8642",
      },
      {
        name: "Roberto Sánchez",
        email: "roberto.sanchez@example.com",
        phone: "+52 55 3698 2541",
      },
    ],
  });

  console.log(`✅ ${customers.count} clientes de prueba creados`);

  console.log("\n🎉 Base de datos inicializada correctamente!");
  console.log("\n📝 Notas:");
  console.log("   - Los productos usan la imagen '/uploads/placeholder.jpg'");
  console.log("   - Puedes reemplazar las imágenes desde el frontend");
}

main()
  .catch((e) => {
    console.error("❌ Error al inicializar la base de datos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
