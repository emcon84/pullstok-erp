import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const ORG_ID = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";

const CATEGORY_TREE: any[] = [
  { name: "ALIMENTACIÓN Y NUTRICIÓN", children: [
    { name: "Perros", children: [
      { name: "Alimento Seco (Balanceado)" }, { name: "Alimento Húmedo (Latas / Sobres)" },
      { name: "Prescripción Médica / Medicado" }, { name: "Snacks, Premios y Golosinas" },
    ]},
    { name: "Gatos", children: [
      { name: "Alimento Seco (Balanceado)" }, { name: "Alimento Húmedo (Pouch / Latas)" },
      { name: "Prescripción Médica / Medicado" }, { name: "Snacks y Golosinas (Catnip, Churu, etc.)" },
    ]},
  ]},
  { name: "FARMACIA, SALUD Y CUIDADOS", children: [
    { name: "Antiparasitarios", children: [
      { name: "Externos (Pipetas, Collares, Sprays, Comprimidos)" }, { name: "Internos (Comprimidos, Jarabes)" },
    ]},
    { name: "Medicamentos Vet (Antibióticos, Antiinflamatorios, Gotas, etc.)" },
    { name: "Suplementos y Vitaminas" },
    { name: "Recuperación y Cuidados Especiales", children: [
      { name: "Collares Isabelinos" }, { name: "Bozales" },
    ]},
  ]},
  { name: "DESCANSO Y HOGAR", children: [
    { name: "Cunas, Camas y Moisés", children: [
      { name: "Moisés" }, { name: "Camas Específicas" }, { name: "Dormilones" }, { name: "Cubos" },
    ]},
    { name: "Colchones, Colchonetas y Pillows", children: [
      { name: "Colchonetas" }, { name: "Colchones" }, { name: "Pillows y Acolchados" },
    ]},
    { name: "Fundas, Mantas y Rellenos", children: [
      { name: "Fundas Cubre Autos" }, { name: "Fundas de Repuesto" }, { name: "Rellenos sueltos" },
    ]},
  ]},
  { name: "ACCESORIOS Y PASEO", children: [
    { name: "Collares, Correas y Pecheras", children: [
      { name: "Collares" }, { name: "Pecheras" }, { name: "Correas" },
    ]},
    { name: "Comederos y Bebederos", children: [{ name: "Platos y Bebederos" }] },
    { name: "Transportadoras y Bolsos", children: [{ name: "Bolsos de Transporte" }] },
    { name: "Mosquetones y Herrajes", children: [{ name: "Mosquetones sueltos" }] },
  ]},
  { name: "ESTÉTICA E HIGIENE", children: [
    { name: "Shampoos, Enjuagues y Colonias" }, { name: "Cepillos, Cardinas y Alicates" },
    { name: "Pañales, Sabanitas y Educadores" }, { name: "Piedras y Sanitarios para Gatos" },
  ]},
  { name: "JUGUETES", children: [
    { name: "Perros (Goma, Mordillos, Peluches, Sogas)" }, { name: "Gatos (Rascadores, Plumas, Cañitas, Ratones)" },
  ]},
  { name: "INDUMENTARIA Y SEGURIDAD", children: [
    { name: "Capas, Chaquetas, Buzos y Abrigos" }, { name: "Salvavidas" },
    { name: "Accesorios de Indumentaria (Pañuelos, Botitas)" },
  ]},
  { name: "IMPORTADOS", children: [] },
];

const SECO_VARIANTS = [
  { name: "Marca", options: ["Bonelo","Cat Chow","Dog Chow","ProPlan","Excellent","Gati","Dentalife","Dogui","Bonzo"] },
  { name: "Segmento", options: ["Premium","Mainstream","Super Premium","Lower Super Premium","Natural"] },
  { name: "Tamaño", options: ["1 KG","3 KG","7.5 KG","12 KG","15 KG","20 KG","21 KG","24 KG"] },
  { name: "Etapa", options: ["Adulto","Cachorro","Senior","Esterilizado","Gatito"] },
];
const HUMEDO_VARIANTS = [
  { name: "Marca", options: ["Cat Chow","Dog Chow","ProPlan"] },
  { name: "Formato", options: ["Lata","Sobre 100g","Pack 15x85g","Pack 15x100g"] },
  { name: "Sabor", options: ["Pollo","Carne","Pavo","Pescado","Mixto"] },
];

const VARIANTS_MAP: Record<string, {name:string,options:string[]}[]> = {
  "Collares": [{ name: "Tipo", options: ["Ahorque","Cuero","Reforzado","Importado c/Pañuelo"] }, { name: "Medida / N°", options: ["Chico","Mediano","Grande","Extra Grande"] }],
  "Pecheras": [{ name: "Tipo", options: ["Reforzada","Cuero","K9","Importada","Mochila"] }, { name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Correas": [{ name: "Tipo", options: ["Cadena","Cuero","Reforzada","Trenzada","Con Resorte"] }, { name: "Largo / Grosor", options: ["1m x 10mm","1m x 15mm","1.2m x 15mm","1.2m x 20mm"] }],
  "Platos y Bebederos": [{ name: "Material", options: ["Acero","Plástico"] }, { name: "Medida (cm)", options: ["12","16","20","24","28"] }],
  "Bolsos de Transporte": [{ name: "Tipo", options: ["Lona","Con Rejilla"] }, { name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Mosquetones sueltos": [{ name: "N°", options: ["1","2","3","4","5"] }, { name: "Tipo", options: ["Común","Automático","Giratorio"] }],
  "Moisés": [{ name: "Modelo", options: ["Tendencia","Jean","Nido","Redondo"] }, { name: "Material", options: ["Pana","Lona","Polar"] }, { name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Camas Específicas": [{ name: "Tipo", options: ["Igloo","Puntas Atadas","Cuadrada"] }, { name: "Material", options: ["Pana","Lona","Polar"] }, { name: "Medida", options: ["50cm","60cm","70cm","80cm","90cm","100cm"] }],
  "Dormilones": [{ name: "Tipo", options: ["Con Cierre","Tursor"] }, { name: "Material", options: ["Pana","Lona","Polar"] }, { name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Cubos": [{ name: "Material", options: ["Pana","Lona","Polar"] }, { name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Colchonetas": [{ name: "Tipo", options: ["Soft","Placa","Mullida","Puffer","Plana"] }, { name: "Tela", options: ["Cordura","Gamuza","Estampada"] }, { name: "Medida", options: ["50cm","60cm","70cm","80cm","90cm","100cm"] }],
  "Colchones": [{ name: "Modelo", options: ["Huella","Traker"] }, { name: "Medida", options: ["60cm","70cm","80cm","90cm","100cm"] }],
  "Pillows y Acolchados": [{ name: "Tipo", options: ["Antimancha","C/Manija"] }, { name: "Medida", options: ["60cm","70cm","80cm","100cm"] }],
  "Fundas Cubre Autos": [{ name: "Tipo", options: ["Lisa","Estampada"] }],
  "Fundas de Repuesto": [{ name: "Material", options: ["Lona","Impermeable"] }, { name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Rellenos sueltos": [{ name: "Medida / Talle", options: ["Chico","Mediano","Grande"] }],
  "Collares Isabelinos": [{ name: "Tipo", options: ["Plástico","Con Abrojo","Algodón"] }, { name: "Talle / N°", options: ["1","2","3","4","5","6"] }],
  "Bozales": [{ name: "Material", options: ["Plástico","Suela","Goma","Alambre"] }, { name: "N° / Talle", options: ["1","2","3","4","5"] }],
  "Capas, Chaquetas, Buzos y Abrigos": [{ name: "Talle", options: ["Chico","Mediano","Grande","Extra Grande"] }, { name: "Material", options: ["Polar","Impermeable","Algodón"] }],
  "Salvavidas": [{ name: "Talle", options: ["Chico","Mediano","Grande"] }],
  "Alimento Seco (Balanceado)": SECO_VARIANTS,
  "Alimento Húmedo (Latas / Sobres)": HUMEDO_VARIANTS,
  "Alimento Húmedo (Pouch / Latas)": HUMEDO_VARIANTS,
  "Piedras y Sanitarios para Gatos": [{ name: "Marca", options: ["Tidy Cats"] }, { name: "Tamaño", options: ["1.8 KG","3.6 KG"] }],
};

async function seedNode(node: any, parentId: string | null) {
  let cat = await prisma.category.findFirst({
    where: { organizationId: ORG_ID, name: node.name, parentId: parentId as any },
  });
  if (!cat) {
    cat = await prisma.category.create({ data: { name: node.name, organizationId: ORG_ID, parentId: parentId as any } });
  }
  const variants = VARIANTS_MAP[node.name];
  if (variants) {
    for (const v of variants) {
      let def = await prisma.categoryVariantDefinition.findFirst({ where: { categoryId: cat.id, name: v.name } });
      if (!def) def = await prisma.categoryVariantDefinition.create({ data: { categoryId: cat.id, name: v.name, organizationId: ORG_ID } });
      for (const opt of v.options) {
        await prisma.categoryVariantOption.upsert({ where: { variantId_value: { variantId: def.id, value: opt } }, update: {}, create: { variantId: def.id, value: opt, organizationId: ORG_ID } });
      }
    }
  }
  if (node.children) for (const child of node.children) await seedNode(child, cat.id);
}

async function main() {
  console.log("Restaurando árbol completo para El Almacén...");
  for (const root of CATEGORY_TREE) await seedNode(root, null);
  console.log("Listo: 8 raíces + subcategorías + variantes.");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
