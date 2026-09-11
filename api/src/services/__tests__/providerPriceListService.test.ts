/**
 * Unit tests del parser de planillas multi-marca (limpieza de nombres).
 * Sin DB. Se invoca parsePriceList con un DetectedLayout fijo para no depender
 * de la detección de proveedor.
 */
import { parsePriceList, type DetectedLayout } from "../providerPriceListService";

const royalCanin = (text: string) =>
  parsePriceList(text, {
    provider: "royal-canin",
    layout: "hierarchical-2lvl",
    sections: [],
  } as DetectedLayout);

describe("parsePriceList — limpieza de nombres raros", () => {
  it("saca el SKU alfanumérico de Royal Canin y el código de línea del nombre", () => {
    const { rows } = royalCanin(
      "CW34H FCN HAIRBALL CARE POUCH (12X85G) X 1.02 KG\t10642\t$12877\t$",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe("HAIRBALL CARE POUCH (12X85G) X 1.02 KG");
    expect(rows[0].codigo).toBe("CW34H");
  });

  it("separa palabras compuestas pegadas (GATOADULTO → GATO ADULTO)", () => {
    const { rows } = royalCanin(
      "EUKANUBA GATOADULTO TOP CONDITION X 1.5 KG\t18426\t$22295\t$",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe("EUKANUBA GATO ADULTO TOP CONDITION X 1.5 KG");
  });

  it("no rompe nombres sin SKU ni código de línea", () => {
    const { rows } = royalCanin(
      "EUKANUBA PUPPY SMALL BREED X 3 KG\t20000\t$24200\t$",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe("EUKANUBA PUPPY SMALL BREED X 3 KG");
    expect(rows[0].codigo).toBeNull();
  });

  it("no compone pesos en filas de continuación (X 3 KG X 10 KG)", () => {
    const { rows } = royalCanin(
      [
        "2544004 Mother & Babycat 0.4\t100\t$121\t$",
        "2544015 1.5\t150\t$181\t$",
      ].join("\n"),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].nombre).toBe("Mother & Babycat X 0.4 KG");
    expect(rows[1].nombre).toBe("Mother & Babycat X 1.5 KG");
  });

  it("saca la etiqueta de sección (HÚMEDO) y el código del nombre", () => {
    const { rows } = royalCanin(
      "HÚMEDO 3390102 URINARY SO FELINE WET POUCH (12X85G) X 1.02 KG\t1120\t$1355\t$",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe(
      "URINARY SO FELINE WET POUCH (12X85G) X 1.02 KG",
    );
    expect(rows[0].codigo).toBe("3390102");
  });

  it("detecta la marca extra (MONKCAT) y no la cuelga de ROYAL CANIN", () => {
    const { rows } = royalCanin(
      "009 MONKCAT NEUTRO 4 KG 2.559,84\t$ 4.623,00\t$",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].marca).toBe("MONKCAT");
  });

  it("productos sin marca (limpieza) NO van a ROYAL CANIN", () => {
    const { rows } = royalCanin(
      "80041 CITRICA 3,8 L 10.502,04\t$ 16.905,90\t$",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].marca).toBeNull();
  });

  it("Royal Canin con línea reconocida mantiene marca ROYAL CANIN", () => {
    const { rows } = royalCanin(
      "URINARY SO FELINE WET POUCH (12X85G) X 1.02 KG 10642\t$12877\t$",
    );
    expect(rows[0].marca).toBe("ROYAL CANIN");
    expect(rows[0].linea).toBe("VETERINARY FELINE");
  });
});

describe("parsePriceList — gama/tipo por sección (planilla mayorista)", () => {
  // Reproduce la estructura de la planilla ROYAL CANIN (periodo 2026-08-18):
  // secciones EUK (etapas, gama null → fallback a línea), secciones RC con
  // gama de header, secciones RC sin header (gama derivada de la línea) y una
  // línea basura "IVA)" que NO debe filtrarse a sublinea/tipo.
  const planilla = [
    "EUKANUBA",
    "PUPPY",
    "EUKANUBA PUPPY SMALL BREED X 3 KG\t20000\t$24200\t$",
    "ADULT",
    "EUKANUBA ADULT MEDIUM BREED X 15 KG\t35000\t$42350\t$",
    "ROYAL CANIN",
    "URINARY",
    "3390102 URINARY SO FELINE WET POUCH (12X85G) X 1.02 KG\t1120\t$1355\t$",
    "FELINE HEALTH NUTRITION",
    "DERMATOLOGY",
    "CW34H DERMATOLOGY POUCH (12X85G) X 1.02 KG\t10642\t$12877\t$",
    "GASTROINTESTINAL",
    "CW35H GASTROINTESTINAL POUCH (12X85G) X 1.02 KG\t11200\t$13552\t$",
    "VITAL SUPPORT",
    "CW36H VITAL SUPPORT POUCH (12X85G) X 1.02 KG\t12000\t$14520\t$",
    "WEIGHT MANAGEMENT",
    "3390110 WEIGHT MANAGEMENT FELINE X 3 KG\t20000\t$24200\t$",
    "FELINE BREED NUTRITION",
    "RAZAS PEQUEÑAS",
    "CW55H RAZAS PEQUEÑAS X 3 KG\t18000\t$21780\t$",
    "GATO",
    "EUKANUBA GATOADULTO TOP CONDITION X 1.5 KG\t18426\t$22295\t$",
    "IVA)",
    "EUKANUBA GATOCACHORRO X 2 KG\t20000\t$24200\t$",
  ].join("\n");

  const rows = () => royalCanin(planilla).rows;

  it("Eukanuba usa la etapa como fallback (gama/tipo null, no hereda RC)", () => {
    const r = rows();
    expect(r[0].marca).toBe("EUKANUBA");
    expect(r[0].linea).toBe("PUPPY");
    expect(r[0].gama).toBeNull();
    expect(r[0].tipo).toBeNull();
    expect(r[1].linea).toBe("ADULT");
    expect(r[1].gama).toBeNull();
    expect(r[1].tipo).toBeNull();
  });

  it("RC sin header de gama deriva la gama de la línea (URINARY → VETERINARY FELINE)", () => {
    const r = rows();
    const urinary = r.find((x) => x.tipo === "URINARY")!;
    expect(urinary.marca).toBe("ROYAL CANIN");
    expect(urinary.gama).toBe("VETERINARY FELINE");
    expect(urinary.tipo).toBe("URINARY");
  });

  it("productos veterinarios NO quedan bajo el catch-all 'FELINE HEALTH NUTRITION'", () => {
    const r = rows();
    const vet = r.filter((x) => x.tipo === "DERMATOLOGY" || x.tipo === "GASTROINTESTINAL");
    expect(vet).toHaveLength(2);
    for (const x of vet) expect(x.gama).toBe("VETERINARY FELINE");
    expect(vet[0].tipo).toBe("DERMATOLOGY");
    expect(vet[1].tipo).toBe("GASTROINTESTINAL");
  });

  it("productos de salud nutricional conservan su gama 'FELINE HEALTH NUTRITION'", () => {
    const r = rows();
    const vital = r.find((x) => x.tipo === "VITAL SUPPORT")!;
    const weight = r.find((x) => x.tipo === "WEIGHT MANAGEMENT")!;
    expect(vital.gama).toBe("FELINE HEALTH NUTRITION");
    expect(weight.gama).toBe("FELINE HEALTH NUTRITION");
  });

  it("productos de razas conservan su gama 'FELINE BREED NUTRITION'", () => {
    const r = rows();
    const razas = r.find((x) => x.tipo === "RAZAS PEQUEÑAS")!;
    expect(razas.gama).toBe("FELINE BREED NUTRITION");
    expect(razas.tipo).toBe("RAZAS PEQUEÑAS");
  });

  it("la línea basura 'IVA)' NO se filtra a sublinea/tipo", () => {
    const r = rows();
    const gatos = r.filter((x) => x.marca === "EUKANUBA" && x.linea === "EUKANUBA");
    expect(gatos).toHaveLength(1);
    expect(gatos[0].sublinea).toBeNull();
    expect(gatos[0].tipo).toBeNull();
    expect(r.some((x) => /IVA/.test(x.tipo ?? "") || /IVA/.test(x.sublinea ?? ""))).toBe(false);
  });
});
