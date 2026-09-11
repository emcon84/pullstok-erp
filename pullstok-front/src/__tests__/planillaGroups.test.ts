import { describe, it, expect } from "vitest";
import {
  speciesOfName,
  subCategoryFromName,
  weightKgOf,
  gamaBySpecies,
  brandOrder,
} from "@/utils/planillaGroups";

describe("speciesOfName — especie derivada del nombre", () => {
  it("detecta gatos por keywords de gato", () => {
    expect(speciesOfName("ROYAL CANIN CLUB PERFORMANCE CAT")).toBe("GATO");
    expect(speciesOfName("ROYAL CANIN KITTEN 4 KG")).toBe("GATO");
    expect(speciesOfName("ROYAL CANIN FELINE INDOOR 7+")).toBe("GATO");
    expect(speciesOfName("ROYAL CANIN POUCH GATO")).toBe("GATO");
    expect(speciesOfName("ROYAL CANIN PERSIAN ADULT")).toBe("GATO");
  });

  it("detecta perros por keywords de perro", () => {
    expect(speciesOfName("ROYAL CANIN PUPPY MINI")).toBe("PERRO");
    expect(speciesOfName("ROYAL CANIN GOLDEN RETRIEVER ADULT")).toBe("PERRO");
    expect(speciesOfName("ROYAL CANIN CYNOTECHNIC")).toBe("PERRO");
    expect(speciesOfName("SIEGER Puppy Mini x 1 Kg.")).toBe("PERRO");
  });

  it("devuelve '' si es ambiguo o no matchea", () => {
    expect(speciesOfName("Producto Suelto")).toBe("");
    expect(speciesOfName("")).toBe("");
  });
});

describe("subCategoryFromName — sub-categoría derivada del nombre", () => {
  it("húmedos", () => {
    expect(subCategoryFromName("ROYAL CANIN POUCH GATO")).toBe("HÚMEDOS");
    expect(subCategoryFromName("ROYAL CANIN LATA PERRO")).toBe("HÚMEDOS");
    expect(subCategoryFromName("ROYAL CANIN MOUSSE")).toBe("HÚMEDOS");
  });

  it("etapas y razas", () => {
    expect(subCategoryFromName("ROYAL CANIN KITTEN 4 KG")).toBe("KITTEN");
    expect(subCategoryFromName("ROYAL CANIN INDOOR 7+")).toBe("INDOOR");
    expect(subCategoryFromName("ROYAL CANIN SENSORY")).toBe("SENSORY");
    expect(subCategoryFromName("ROYAL CANIN GROWTH")).toBe("GROWTH");
    expect(subCategoryFromName("ROYAL CANIN MOTHER & BABYCAT")).toBe("KITTEN");
  });

  it("tallas", () => {
    expect(subCategoryFromName("ROYAL CANIN MINI ADULT")).toBe("MINI");
    expect(subCategoryFromName("ROYAL CANIN X-SMALL PUPPY")).toBe("MINI");
    expect(subCategoryFromName("ROYAL CANIN MEDIUM ADULT")).toBe("MEDIUM");
    expect(subCategoryFromName("ROYAL CANIN MAXI ADULT")).toBe("MAXI");
    expect(subCategoryFromName("ROYAL CANIN GIANT ADULT")).toBe("GIANT");
  });

  it("sub-categorías específicas nuevas (Royal Canin / Eukanuba)", () => {
    expect(subCategoryFromName("EUKANUBA GATO ADULTO TOP CONDITION X 1.5 KG")).toBe("GATO ADULTO");
    expect(subCategoryFromName("ROYAL CANIN PERSIAN X 1.5 KG")).toBe("PERSIAN");
    expect(subCategoryFromName("ROYAL CANIN CARDIAC CANINE X 2 KG")).toBe("CARDIAC");
    expect(subCategoryFromName("ROYAL CANIN URINARY CARE X 1.5 KG")).toBe("URINARY");
    expect(subCategoryFromName("ROYAL CANIN GATOADULTO TOP CONDITION")).toBe("GATO ADULTO");
  });

  it("devuelve '' sin match", () => {
    expect(subCategoryFromName("Producto Suelto")).toBe("");
    expect(subCategoryFromName("")).toBe("");
  });
});

describe("weightKgOf — peso en KG extraído del nombre", () => {
  it("extrae el peso con punto decimal", () => {
    expect(weightKgOf("ROYAL CANIN GATO ADULTO TOP CONDITION X 1.5 KG")).toBe(1.5);
    expect(weightKgOf("EUKANUBA PUPPY X 3 KG")).toBe(3);
    expect(weightKgOf("ROYAL CANIN MAXI X 15KG")).toBe(15);
  });

  it("extrae el peso con coma decimal", () => {
    expect(weightKgOf("ROYAL CANIN KITTEN X 1,5 Kg")).toBe(1.5);
  });

  it("devuelve Infinity si no hay peso", () => {
    expect(weightKgOf("ROYAL CANIN MOUSSE")).toBe(Infinity);
    expect(weightKgOf("Producto Suelto")).toBe(Infinity);
    expect(weightKgOf("")).toBe(Infinity);
  });
});

describe("gamaBySpecies — corrección de gama según especie", () => {
  it("mueve gatos fuera de una gama canina", () => {
    expect(gamaBySpecies("CANINE", "ROYAL CANIN CLUB PERFORMANCE CAT")).toBe("FELINE");
    expect(gamaBySpecies("VETERINARY CANINE", "ROYAL CANIN CAT")).toBe("VETERINARY FELINE");
    expect(gamaBySpecies("Canine Health Nutrition", "ROYAL CANIN CAT")).toBe("FELINE");
  });

  it("mueve perros fuera de una gama felina", () => {
    expect(gamaBySpecies("FELINE", "ROYAL CANIN PUPPY MINI")).toBe("CANINE");
    expect(gamaBySpecies("VETERINARY FELINE", "ROYAL CANIN DOG")).toBe("VETERINARY CANINE");
    expect(gamaBySpecies("Feline Health Nutrition", "ROYAL CANIN PUPPY")).toBe("CANINE");
  });

  it("deja la gama intacta si la especie coincide o no aplica", () => {
    expect(gamaBySpecies("FELINE", "ROYAL CANIN KITTEN")).toBe("FELINE");
    expect(gamaBySpecies("CANINE", "ROYAL CANIN PUPPY")).toBe("CANINE");
    expect(gamaBySpecies("", "ROYAL CANIN KITTEN")).toBe("");
    expect(gamaBySpecies("CANINE", "Producto Suelto")).toBe("CANINE");
  });
});

describe("brandOrder — orden de marcas en la planilla impresa", () => {
  it("pone ROYAL CANIN primero", () => {
    expect(brandOrder("ROYAL CANIN")).toBe(0);
    expect(brandOrder("royal canin")).toBe(0);
  });

  it("pone EUKANUBA al final", () => {
    expect(brandOrder("EUKANUBA")).toBe(999);
    expect(brandOrder("eukanuba")).toBe(999);
  });

  it("pone las demás marcas en el medio", () => {
    expect(brandOrder("SIEGER")).toBe(100);
    expect(brandOrder("MONKCAT")).toBe(100);
    expect(brandOrder("")).toBe(100);
  });
});
