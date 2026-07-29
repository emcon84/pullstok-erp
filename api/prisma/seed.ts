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

  // 3) Full category tree with variants — defined inline, shared with reset-demo.ts
  //    Structure: { name, children?: [...], variants?: [{ name, options: [...] }] }
  const CATEGORY_TREE = [
    {
      name: "ALIMENTACIÓN Y NUTRICIÓN",
      children: [
        { name: "Perros", children: [
          { name: "Alimento Seco (Balanceado)" },
          { name: "Alimento Húmedo (Latas / Sobres)" },
          { name: "Prescripción Médica / Medicado" },
          { name: "Snacks, Premios y Golosinas" },
        ]},
        { name: "Gatos", children: [
          { name: "Alimento Seco (Balanceado)" },
          { name: "Alimento Húmedo (Pouch / Latas)" },
          { name: "Prescripción Médica / Medicado" },
          { name: "Snacks y Golosinas (Catnip, Churu, etc.)" },
        ]},
      ],
    },
    {
      name: "FARMACIA, SALUD Y CUIDADOS",
      children: [
        { name: "Antiparasitarios", children: [
          { name: "Externos (Pipetas, Collares, Sprays, Comprimidos)" },
          { name: "Internos (Comprimidos, Jarabes)" },
        ]},
        { name: "Medicamentos Vet (Antibióticos, Antiinflamatorios, Gotas, etc.)" },
        { name: "Suplementos y Vitaminas" },
        { name: "Recuperación y Cuidados Especiales", children: [
          { name: "Collares Isabelinos", variants: [
            { name: "Tipo", options: ["Plástico", "Con Abrojo", "Algodón"] },
            { name: "Talle / N°", options: ["1","2","3","4","5","6"] },
          ]},
          { name: "Bozales", variants: [
            { name: "Material", options: ["Plástico", "Suela", "Goma", "Alambre"] },
            { name: "N° / Talle", options: ["1","2","3","4","5"] },
          ]},
        ]},
      ],
    },
    {
      name: "DESCANSO Y HOGAR",
      children: [
        { name: "Cunas, Camas y Moisés", children: [
          { name: "Moisés", variants: [
            { name: "Modelo", options: ["Tendencia","Jean","Nido","Redondo"] },
            { name: "Material", options: ["Pana","Lona","Polar"] },
            { name: "Talle", options: ["Chico","Mediano","Grande"] },
          ]},
          { name: "Camas Específicas", variants: [
            { name: "Tipo", options: ["Igloo","Puntas Atadas","Cuadrada"] },
            { name: "Material", options: ["Pana","Lona","Polar"] },
            { name: "Medida", options: ["50cm","60cm","70cm","80cm","90cm","100cm"] },
          ]},
          { name: "Dormilones", variants: [
            { name: "Tipo", options: ["Con Cierre","Tursor"] },
            { name: "Material", options: ["Pana","Lona","Polar"] },
            { name: "Talle", options: ["Chico","Mediano","Grande"] },
          ]},
          { name: "Cubos", variants: [
            { name: "Material", options: ["Pana","Lona","Polar"] },
            { name: "Talle", options: ["Chico","Mediano","Grande"] },
          ]},
        ]},
        { name: "Colchones, Colchonetas y Pillows", children: [
          { name: "Colchonetas", variants: [
            { name: "Tipo", options: ["Soft","Placa","Mullida","Puffer","Plana"] },
            { name: "Tela", options: ["Cordura","Gamuza","Estampada"] },
            { name: "Medida", options: ["50cm","60cm","70cm","80cm","90cm","100cm"] },
          ]},
          { name: "Colchones", variants: [
            { name: "Modelo", options: ["Huella","Traker"] },
            { name: "Medida", options: ["60cm","70cm","80cm","90cm","100cm"] },
          ]},
          { name: "Pillows y Acolchados", variants: [
            { name: "Tipo", options: ["Antimancha","C/Manija"] },
            { name: "Medida", options: ["60cm","70cm","80cm","100cm"] },
          ]},
        ]},
        { name: "Fundas, Mantas y Rellenos", children: [
          { name: "Fundas Cubre Autos", variants: [{ name: "Tipo", options: ["Lisa","Estampada"] }] },
          { name: "Fundas de Repuesto", variants: [
            { name: "Material", options: ["Lona","Impermeable"] },
            { name: "Talle", options: ["Chico","Mediano","Grande"] },
          ]},
          { name: "Rellenos sueltos", variants: [{ name: "Medida / Talle", options: ["Chico","Mediano","Grande"] }] },
        ]},
      ],
    },
    {
      name: "ACCESORIOS Y PASEO",
      children: [
        { name: "Collares, Correas y Pecheras", children: [
          { name: "Collares", variants: [
            { name: "Tipo", options: ["Ahorque","Cuero","Reforzado","Importado c/Pañuelo"] },
            { name: "Medida / N°", options: ["Chico","Mediano","Grande","Extra Grande"] },
          ]},
          { name: "Pecheras", variants: [
            { name: "Tipo", options: ["Reforzada","Cuero","K9","Importada","Mochila"] },
            { name: "Talle", options: ["Chico","Mediano","Grande"] },
          ]},
          { name: "Correas", variants: [
            { name: "Tipo", options: ["Cadena","Cuero","Reforzada","Trenzada","Con Resorte"] },
            { name: "Largo / Grosor", options: ["1m x 10mm","1m x 15mm","1.2m x 15mm","1.2m x 20mm"] },
          ]},
        ]},
        { name: "Comederos y Bebederos", children: [
          { name: "Platos y Bebederos", variants: [
            { name: "Material", options: ["Acero","Plástico"] },
            { name: "Medida (cm)", options: ["12","16","20","24","28"] },
          ]},
        ]},
        { name: "Transportadoras y Bolsos", children: [
          { name: "Bolsos de Transporte", variants: [
            { name: "Tipo", options: ["Lona","Con Rejilla"] },
            { name: "Talle", options: ["Chico","Mediano","Grande"] },
          ]},
        ]},
        { name: "Mosquetones y Herrajes", children: [
          { name: "Mosquetones sueltos", variants: [
            { name: "N°", options: ["1","2","3","4","5"] },
            { name: "Tipo", options: ["Común","Automático","Giratorio"] },
          ]},
        ]},
      ],
    },
    {
      name: "ESTÉTICA E HIGIENE",
      children: [
        { name: "Shampoos, Enjuagues y Colonias" },
        { name: "Cepillos, Cardinas y Alicates" },
        { name: "Pañales, Sabanitas y Educadores" },
        { name: "Piedras y Sanitarios para Gatos" },
      ],
    },
    {
      name: "JUGUETES",
      children: [
        { name: "Perros (Goma, Mordillos, Peluches, Sogas)" },
        { name: "Gatos (Rascadores, Plumas, Cañitas, Ratones)" },
      ],
    },
    {
      name: "INDUMENTARIA Y SEGURIDAD",
      children: [
        { name: "Capas, Chaquetas, Buzos y Abrigos", variants: [
          { name: "Talle", options: ["Chico","Mediano","Grande","Extra Grande"] },
          { name: "Material", options: ["Polar","Impermeable","Algodón"] },
        ]},
        { name: "Salvavidas", variants: [{ name: "Talle", options: ["Chico","Mediano","Grande"] }] },
        { name: "Accesorios de Indumentaria (Pañuelos, Botitas)" },
      ],
    },
    { name: "IMPORTADOS", children: [] as any[] },
  ] as const;

  // Recursive helper: upsert category with parentId, then variants
  async function seedNode(
    node: { name: string; children?: any[]; variants?: { name: string; options: string[] }[] },
    parentId: string | null,
  ) {
    // Prisma 7: @@unique([orgId, parentId, name]) no acepta null en el where del upsert.
    // Usamos findFirst + create en vez de upsert para soportar parentId nullable.
    let cat = await prisma.category.findFirst({
      where: {
        organizationId: org.id,
        name: node.name,
        parentId: parentId ?? null as any,
      },
    });
    if (!cat) {
      cat = await prisma.category.create({
        data: { name: node.name, organizationId: org.id, parentId: parentId as any },
      });
    }

    // Seed variants for leaf categories
    if (node.variants && node.variants.length > 0) {
      for (const v of node.variants) {
        const def = await prisma.categoryVariantDefinition.upsert({
          where: { categoryId_name: { categoryId: cat.id, name: v.name } },
          update: {},
          create: { categoryId: cat.id, name: v.name, organizationId: org.id },
        });
        for (const optVal of v.options) {
          await prisma.categoryVariantOption.upsert({
            where: { variantId_value: { variantId: def.id, value: optVal } },
            update: {},
            create: { variantId: def.id, value: optVal, organizationId: org.id },
          });
        }
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        await seedNode(child, cat.id);
      }
    }
  }

  // Seed all root categories
  let totalCats = 0;
  for (const root of CATEGORY_TREE) {
    await seedNode(root, null);
    totalCats++;
  }
  console.log(`✅ Árbol completo de categorías + variantes creado`);

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
