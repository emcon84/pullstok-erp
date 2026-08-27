import { describe, it, expect } from "vitest";
import {
  parseWeightFromName,
  productWeight,
  formatWeight,
} from "./productWeight";
import type { DataItem } from "../types";

const P = (name: string, weightKg?: number | null): DataItem => ({
  name,
  price: 0,
  quantity: 0,
  weightKg: weightKg ?? undefined,
});

describe("parseWeightFromName", () => {
  it("parsea X{kg}KG", () => {
    expect(parseWeightFromName("PRO PLAN DOG REDUCED CALORIE RAZAS MEDIANAS Y GRANDES X15KG")).toBe(15);
    expect(parseWeightFromName("CAT CHOW ADULT PESCADO X3KG")).toBe(3);
    expect(parseWeightFromName("DOG CHOW SENIOR X8KG")).toBe(8);
  });

  it("parsea X{kg}K (sin G) y X{kg} con coma", () => {
    expect(parseWeightFromName("CAT CHOW GATITOS X 15 K")).toBe(15);
    expect(parseWeightFromName("DOG CHOW ADULT HIGH PROTEIN X2,7K")).toBe(2.7);
    expect(parseWeightFromName("EXCELLENT CAT ADULT X7,5KG")).toBe(7.5);
  });

  it("parsea '{n} KG' con espacio", () => {
    expect(parseWeightFromName("CAT CHOW ADULTOS CARNE X 15 KG")).toBe(15);
    expect(parseWeightFromName("DOG CHOW EDAD MADURA X 8 KG")).toBe(8);
  });

  it("parsea gramos (X500G / 500 GRS) a kg", () => {
    expect(parseWeightFromName("CAT CHOW ADULTOS CARNE X500G")).toBe(0.5);
    expect(parseWeightFromName("CAT CHOW GATITOS X 500 GRS")).toBe(0.5);
  });

  it("NO interpreta multi-pack húmedos como kg", () => {
    expect(parseWeightFromName("PRO PLAN WET CAT POLLO 15X85G")).toBeNull();
    expect(parseWeightFromName("DOG CHOW WET PAVO 15 S X 100GR")).toBeNull();
    expect(parseWeightFromName("CAT CHOW WET GATITO POLL 15X85")).toBeNull();
  });

  it("devuelve null si no hay peso detectable", () => {
    expect(parseWeightFromName("PRO PLAN WET DOG POLLO")).toBeNull();
    expect(parseWeightFromName(undefined)).toBeNull();
  });
});

describe("productWeight", () => {
  it("prioriza el campo weightKg", () => {
    expect(productWeight(P("PROPLAN ADULT X15KG", 15))).toBe(15);
  });
  it("cae al parseo del nombre si falta weightKg", () => {
    expect(productWeight(P("PRO PLAN DOG REDUCED CALORIE RAZAS MEDIANAS Y GRANDES X3KG"))).toBe(3);
  });
  it("devuelve null para multi-pack húmedos sin weightKg", () => {
    expect(productWeight(P("PRO PLAN WET CAT POLLO 15X85G"))).toBeNull();
  });
});

describe("formatWeight", () => {
  it("formatea enteros y decimales con coma", () => {
    expect(formatWeight(P("X15KG"))).toBe("15 kg");
    expect(formatWeight(P("X7,5KG"))).toBe("7,5 kg");
  });
  it("muestra guion cuando no hay peso", () => {
    expect(formatWeight(P("PRO PLAN WET CAT POLLO 15X85G"))).toBe("—");
  });
});
