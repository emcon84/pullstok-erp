import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import {
  detectLayout,
  capturePeriod,
  extractUnit,
  isNoiseLine,
  parseAlicanSeco,
  parseAlicanWet,
  LayoutNotSupportedError,
} from "../../src/services/providerPriceListService";

const FIXTURES = path.join(__dirname, "../fixtures/pdfs");
const SECO_TXT = fs.readFileSync(path.join(FIXTURES, "alican-seco-082026.txt"), "utf8");
const WET_TXT = fs.readFileSync(path.join(FIXTURES, "alican-wet-082026.txt"), "utf8");

describe("detectLayout — structural fingerprint (never silent)", () => {
  it("detects SECO by header + price columns + hierarchy lines", () => {
    expect(detectLayout(SECO_TXT)).toBe("SECO");
  });

  it("detects WET by the UNIDAD DE EMPAQUE column", () => {
    expect(detectLayout(WET_TXT)).toBe("WET");
  });

  it("throws LayoutNotSupportedError for an unknown layout (never silent)", () => {
    expect(() => detectLayout("FACTURA DE COMPRA GENERICA\nSIN COLUMNAS DE PRECIOS")).toThrow(
      LayoutNotSupportedError,
    );
  });
});

describe("capturePeriod — VIGENCIA dd/mm/aaaa → ISO", () => {
  it("captures the SECO vigencia (VIGENCIA 10/08/2026 → 2026-08-10)", () => {
    expect(capturePeriod(SECO_TXT)).toBe("2026-08-10");
  });

  it("captures the WET vigencia", () => {
    expect(capturePeriod(WET_TXT)).toBe("2026-08-10");
  });

  it("returns null when VIGENCIA is absent or unparseable", () => {
    expect(capturePeriod("LISTA DE PRECIOS\nSIN VIGENCIA")).toBeNull();
  });
});

describe("extractUnit — trailing pack expression of a product name", () => {
  it("extracts Kg from the classic pack pattern (x 1 Kg. → 1 Kg.)", () => {
    expect(extractUnit("SIEGER Puppy Mini x 1 Kg.")).toBe("1 Kg.");
  });

  it("extracts grams (x 100 gr. → 100 gr.)", () => {
    expect(extractUnit("Sieger Vet ONC - Onco Inmuno x 100 gr.")).toBe("100 gr.");
  });

  it("extracts comma-decimal quantities (x 1,5 Kg. → 1,5 Kg.)", () => {
    expect(extractUnit("SIEGER Ultra Osteoarticular - bolsa x 1,5 Kg.")).toBe(
      "1,5 Kg.",
    );
  });

  it("returns null when there is no pack expression", () => {
    expect(extractUnit("STARTER Kit")).toBeNull();
  });
});

describe("isNoiseLine — headers/footers/page markers", () => {
  it("flags page/header/footer lines", () => {
    expect(isNoiseLine("VIGENCIA 10/08/2026 HOJA 1/6")).toBe(true);
    expect(isNoiseLine("Página 1 de 6")).toBe(true);
    expect(isNoiseLine("-- 1 of 6 --")).toBe(true);
    expect(isNoiseLine("33,34%")).toBe(true);
    expect(isNoiseLine("LA RED COMERCIAL S.R.L")).toBe(true);
    expect(isNoiseLine("LISTA DE PRECIOS ALICAN - precios sin iva")).toBe(true);
    expect(isNoiseLine("| CUENTA CORRIENTE 30 DÍAS FECHA DE FACTURA.")).toBe(true);
    expect(isNoiseLine("PRECIOS SIN")).toBe(true);
    expect(isNoiseLine("IVA")).toBe(true);
    expect(isNoiseLine("SUGERIDO PÚBLICO")).toBe(true);
    expect(isNoiseLine('MODALIDAD DE VENTA: "10+1" ó "20 bm combinado con Gooster"')).toBe(
      true,
    );
    expect(isNoiseLine("DESCRIPCIÓN UNIDAD DE")).toBe(true);
  });

  it("keeps hierarchy and product lines", () => {
    expect(isNoiseLine("SIEGER PUPPY")).toBe(false);
    expect(isNoiseLine("LÍNEA SUPER PREMIUM PARA PERROS")).toBe(false);
    expect(isNoiseLine("SIEGER Puppy Mini x 1 Kg. $ 8.795 $ 10.642 $ 14.190")).toBe(
      false,
    );
  });
});

describe("parseAlicanSeco — real SECO fixture (state machine)", () => {
  const { period, rows } = parseAlicanSeco(SECO_TXT);

  it("captures the vigencia as period", () => {
    expect(period).toBe("2026-08-10");
  });

  it("parses 138 rows: 137 with prices + 1 error row (the '-' priced product)", () => {
    expect(rows).toHaveLength(138);
    const withPrices = rows.filter((r) => r.precioSinIva !== null || r.precioConIva !== null);
    const errors = rows.filter((r) => r.precioSinIva === null && r.precioConIva === null);
    expect(withPrices).toHaveLength(137);
    expect(errors).toHaveLength(1);
    expect(errors[0].nombre).toBe("GOOSTER Adultos Razas Pequeñas (C/P) x 15 Kg.");
  });

  it("preserves the PDF hierarchy on the first row (marca/línea/sublínea)", () => {
    const first = rows[0];
    expect(first).toMatchObject({
      nombre: "SIEGER Puppy Mini x 1 Kg.",
      marca: "SIEGER",
      linea: "SUPER PREMIUM PARA PERROS",
      sublinea: "SIEGER PUPPY",
    });
    expect(first.precioSinIva).toBe(8795);
    expect(first.precioConIva).toBe(10642);
    expect(first.unidadEmpaque).toBe("1 Kg.");
  });

  it("keeps the subline context for rows after a new subline (KATZE ADULTO)", () => {
    const row = rows.find((r) => r.nombre === "Sieger Katze Adult High Quality Prot. x 1 kg.");
    expect(row?.marca).toBe("SIEGER KATZE");
    expect(row?.linea).toBe("SUPER PREMIUM PARA GATOS");
    expect(row?.sublinea).toBe("KATZE ADULTO");
  });

  it("creates sections without line when a brand has no LÍNEA (BENTONITA HOMEBRAND)", () => {
    const row = rows.find((r) => r.nombre === "Homebrand Bentonita Natural x 5 kg");
    expect(row?.marca).toBe("BENTONITA HOMEBRAND");
    expect(row?.linea).toBeNull();
    expect(row?.sublinea).toBeNull();
  });

  it("normalizes WET-style decimals in SECO prices when present", () => {
    const row = rows.find((r) => r.nombre === "AGILITY + Adult Cat Salmón x 1,5 Kg.");
    expect(row?.precioSinIva).toBe(11981);
  });

  it("treats a name without prices as an error row, not a batch failure", () => {
    const { rows: synthetic } = parseAlicanSeco(
      "LISTA DE PRECIOS ALICAN - precios sin iva\n" +
        "SIEGER\nLÍNEA SUPER PREMIUM PARA PERROS\n" +
        "STARTER Kit\n" +
        "SIEGER Puppy Mini x 1 Kg. $ 8.795 $ 10.642 $ 14.190",
    );
    const starter = synthetic.find((r) => r.nombre === "STARTER Kit");
    expect(starter).toBeDefined();
    expect(starter?.precioSinIva).toBeNull();
    expect(starter?.precioConIva).toBeNull();
    expect(synthetic.find((r) => r.nombre === "SIEGER Puppy Mini x 1 Kg.")).toBeDefined();
  });

  it("treats dash prices ('- - -') as an error row with null prices", () => {
    const { rows: synthetic } = parseAlicanSeco(
      "LISTA DE PRECIOS ALICAN\n" +
        "SIEGER\n" +
        "GOOSTER Adultos Razas Pequeñas (C/P) x 15 Kg. - - -",
    );
    const dash = synthetic.find((r) => r.nombre === "GOOSTER Adultos Razas Pequeñas (C/P) x 15 Kg.");
    expect(dash?.precioSinIva).toBeNull();
    expect(dash?.precioConIva).toBeNull();
  });

  it("keeps duplicate names as separate rows (conserved, not collapsed)", () => {
    const { rows: synthetic } = parseAlicanSeco(
      "LISTA DE PRECIOS ALICAN\n" +
        "SIEGER\n" +
        "DUP x 1 Kg. $ 8.795 $ 10.642 $ 14.190\n" +
        "DUP x 1 Kg. $ 8.795 $ 10.642 $ 14.190",
    );
    const dups = synthetic.filter((r) => r.nombre === "DUP x 1 Kg.");
    expect(dups).toHaveLength(2);
  });
});

describe("parseAlicanWet — real WET fixture (flat layout)", () => {
  const { period, rows } = parseAlicanWet(WET_TXT);

  it("captures the vigencia as period", () => {
    expect(period).toBe("2026-08-10");
  });

  it("parses 64 rows, all with prices", () => {
    expect(rows).toHaveLength(64);
    expect(rows.every((r) => r.precioSinIva !== null)).toBe(true);
  });

  it("is flat: brand/line/subline are null, unit comes from the separate column", () => {
    const first = rows[0];
    expect(first.nombre).toBe("Sieger Puppy Salmon y Pollo WET x 100 gr.");
    expect(first.marca).toBeNull();
    expect(first.linea).toBeNull();
    expect(first.sublinea).toBeNull();
    expect(first.unidadEmpaque).toBe("12 pouches x 100 gr");
    expect(first.precioSinIva).toBe(2125.4);
    expect(first.precioConIva).toBe(2571.7);
  });

  it("extracts the unit for latin-can rows (6 latas x 340 gr)", () => {
    const row = rows.find((r) => r.nombre === "Agility Dog Adulto Carne x 340 gr. EO");
    expect(row?.unidadEmpaque).toBe("6 latas x 340 gr");
    expect(row?.precioConIva).toBe(4283.9);
  });
});

// pdf-parse v2 (pdfjs ESM) requires --experimental-vm-modules inside the jest
// VM; without it, getText() throws at the fake-worker setup (infrastructure
// limitation, not a parser failure). The .txt fixtures ARE the byte-identical
// live extraction, so the parser is always validated against the real supplier
// text; these live-PDF tests additionally prove the extraction step whenever
// the environment supports it. Run with:
//   NODE_OPTIONS=--experimental-vm-modules pnpm jest tests/services/providerPriceListService.test.ts
const pdfIntegration =
  process.env.NODE_OPTIONS?.includes("--experimental-vm-modules")
    ? describe
    : describe.skip;

pdfIntegration("Integration: parser against the REAL PDFs (pdf-parse live extraction)", () => {
  it("parses the real SECO PDF with the same 138 rows as the .txt fixture", async () => {
    const buf = fs.readFileSync(path.join(FIXTURES, "alican-seco-082026.pdf"));
    const parser = new PDFParse({ data: buf });
    const res = await parser.getText();
    const { rows } = parseAlicanSeco(res.text);
    expect(rows).toHaveLength(138);
    expect(rows[0].nombre).toBe("SIEGER Puppy Mini x 1 Kg.");
  });

  it("parses the real WET PDF with 64 rows", async () => {
    const buf = fs.readFileSync(path.join(FIXTURES, "alican-wet-082026.pdf"));
    const parser = new PDFParse({ data: buf });
    const res = await parser.getText();
    const { rows } = parseAlicanWet(res.text);
    expect(rows).toHaveLength(64);
    expect(rows[0].precioSinIva).toBe(2125.4);
  });
});
