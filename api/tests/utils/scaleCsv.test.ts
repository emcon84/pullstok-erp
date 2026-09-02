import {
  buildDescription,
  buildRow,
  formatPrice,
} from "../../src/utils/scaleCsv";

describe("scaleCsv — formato CSV de códigos de balanza (Qendra / Systel Cuora)", () => {
  describe("buildDescription — \"MARCA TIPO ESPECIE\" truncada a 18 en zona ASCII", () => {
    it("arma el texto en mayúsculas y trunca a 18 caracteres", () => {
      // "7 VIDAS ADULTO GATO" → slice(0,18) = "7 VIDAS ADULTO GAT"
      expect(buildDescription("7 VIDAS", "ADULTO", "GATO")).toBe("7 VIDAS ADULTO GAT");
    });

    it("invierte el caso a mayúsculas, sin importar cómo llegue", () => {
      expect(buildDescription("Royal Canin", "Senior", "perro")).toBe("ROYAL CANIN SENIOR");
    });

    it("no desborda: mantiene exactamente 18 caracteres máx", () => {
      const desc = buildDescription("UN NOMBRE DE MARCA MUY LARGO", "ETAPA", "ESPECIE");
      expect(desc.length).toBeLessThanOrEqual(18);
    });

    it("ignora comillas, acentos fuera de la zona ASCII y espacios sobrantes", () => {
      // La Cuora no soporta ':' por sí solo? El doc Systel restringe el charset.
      const desc = buildDescription("MAXXIUM", "POLLO&CACHORRO", "PERRO");
      expect(desc).toMatch(/^[A-Z0-9 .&"'(),\-\/]+$/);
      expect(desc.length).toBeLessThanOrEqual(18);
    });
  });

  describe("formatPrice — decimal con coma (config regional AR)", () => {
    it("usa coma como separador decimal y dos decimales", () => {
      expect(formatPrice(800)).toBe("800,00");
      expect(formatPrice(1234.5)).toBe("1234,50");
    });

    it("redondea a 2 decimales", () => {
      expect(formatPrice(5450.123)).toBe("5450,12");
    });
  });

  describe("buildRow — fila delimitada por ';' con PLU duplicado y tipo 'peso'", () => {
    it("arma la fila completa en el orden del formato Qendra", () => {
      const row = buildRow({
        section: "SUELTO",
        code: "0101",
        description: "7 VIDAS ADULTO GAT",
        price: "6000,00",
      });
      expect(row).toBe("SUELTO;0101;7 VIDAS ADULTO GAT;0101;6000,00;0,00;peso;0;");
    });

    it("repite el PLU en Código y Número (recomendación Systel) y fuerza precio lista 2 = 0,00", () => {
      const row = buildRow({
        section: "SUELTO",
        code: "0201",
        description: "AGILITY ADULTO GAT",
        price: "8000,00",
      });
      const cols = row.split(";");
      expect(cols[1]).toBe("0201"); // Código PLU
      expect(cols[3]).toBe("0201"); // Número PLU
      expect(cols[5]).toBe("0,00"); // Precio lista 2
      expect(cols[6]).toBe("peso"); // Tipo de venta
      expect(cols).toHaveLength(9);
    });
  });
});
