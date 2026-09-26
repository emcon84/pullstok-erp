import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// El pre-proceso del logo (fetch + canvas) se prueba aparte en ticketLogo.test.ts;
// acá se controla qué devuelve para no tocar la red.
vi.mock("@/utils/ticketLogo", () => ({ prepareTicketLogo: vi.fn() }));

import { prepareTicketLogo } from "@/utils/ticketLogo";
import {
  buildSaleTicket,
  renderSaleTicketHtml,
  printSaleTicket,
  resolveTicketCompany,
  type SaleTicket,
  type SaleTicketItem,
} from "@/utils/saleTicket";

// Ticket térmico 58 mm: modelo puro, render HTML compacto e impresión desde un
// iframe oculto (el @page A4 global de index.css no debe interferir).

const ISSUED_AT = new Date(2026, 8, 24, 15, 30, 0); // 24/09/2026 15:30 (local)

function build(
  items: SaleTicketItem[],
  extra: Partial<Parameters<typeof buildSaleTicket>[0]> = {},
): SaleTicket {
  return buildSaleTicket({
    businessName: "Mi Pet Shop",
    issuedAt: ISSUED_AT,
    items,
    payments: [{ method: "EFECTIVO", amount: 0 }],
    discountPct: 0,
    ...extra,
  });
}

const bolsa: SaleTicketItem = {
  name: "Royal Canin Adulto 15kg",
  price: 8000,
  quantity: 2,
  saleMode: "BOLSA_CERRADA",
};

describe("buildSaleTicket — líneas por modo de venta", () => {
  it("bolsa cerrada: '2 x $8.000' y total de línea", () => {
    const t = build([bolsa]);
    expect(t.lines).toEqual([
      { label: "Royal Canin Adulto 15kg", detail: "2 x $8.000", total: 16000 },
    ]);
  });

  it("por unidad: usa perUnitPrice ?? price", () => {
    const t = build([
      {
        name: "Felix Pouch",
        price: 18400,
        perUnitPrice: 1226.67,
        quantity: 3,
        saleMode: "POR_UNIDAD",
      },
      { name: "Pouch B", price: 500, quantity: 4, saleMode: "POR_UNIDAD" },
    ]);
    expect(t.lines[0].detail).toBe("3 x $1.226,67");
    expect(t.lines[0].total).toBeCloseTo(3680.01, 2);
    expect(t.lines[1].detail).toBe("4 x $500");
    expect(t.lines[1].total).toBe(2000);
  });

  it("por peso: '1,50 kg x $8.000/kg' y usa looseName como etiqueta", () => {
    const t = build([
      {
        name: "producto interno",
        looseName: "ROYAL · ADULTO",
        price: 8000,
        quantity: 1.5,
        saleMode: "POR_PESO",
      },
    ]);
    expect(t.lines[0].label).toBe("ROYAL · ADULTO");
    expect(t.lines[0].detail).toBe("1,50 kg x $8.000/kg");
    expect(t.lines[0].total).toBe(12000);
  });

  it("por monto: '$3.000 (0,375 kg)' con priceKgSuelto; sin él, solo el monto", () => {
    const t = build([
      {
        name: "x",
        looseName: "SUELTO A",
        price: 1,
        quantity: 3000,
        priceKgSuelto: 8000,
        saleMode: "POR_MONTO",
      },
      { name: "SUELTO B", price: 1, quantity: 1500, saleMode: "POR_MONTO" },
    ]);
    expect(t.lines[0].detail).toBe("$3.000 (0,375 kg)");
    expect(t.lines[0].total).toBe(3000);
    expect(t.lines[1].detail).toBe("$1.500");
    expect(t.lines[1].total).toBe(1500);
  });

  it("blister suelto: cantidad de pastillas x precio por pastilla", () => {
    const t = build([
      { name: "IBUPROFENO", price: 700, quantity: 4, saleMode: "POR_UNIDAD_BLISTER" },
    ]);
    expect(t.lines[0].detail).toBe("4 x $700");
    expect(t.lines[0].total).toBe(2800);
  });

  it("sin saleMode se trata como bolsa cerrada", () => {
    const t = build([{ name: "Sin modo", price: 100, quantity: 3 }]);
    expect(t.lines[0].detail).toBe("3 x $100");
  });
});

describe("buildSaleTicket — totales, descuento y pagos", () => {
  it("sin descuento: total == subtotal y descuento 0", () => {
    const t = build([bolsa]);
    expect(t.subtotal).toBe(16000);
    expect(t.discountPct).toBe(0);
    expect(t.discountAmount).toBe(0);
    expect(t.total).toBe(16000);
  });

  it("con descuento 10%: mismo cálculo que el panel (round2)", () => {
    const t = build([bolsa], { discountPct: 10 });
    expect(t.subtotal).toBe(16000);
    expect(t.discountPct).toBe(10);
    expect(t.discountAmount).toBe(1600);
    expect(t.total).toBe(14400);
  });

  it("sin recargo: surchargePct/surchargeAmount en 0 y total sin cambios", () => {
    const t = build([bolsa]);
    expect(t.surchargePct).toBe(0);
    expect(t.surchargeAmount).toBe(0);
    expect(t.total).toBe(16000);
  });

  it("recargo de tarjeta: solo sobre la fila TARJETA_CREDITO y suma al total", () => {
    const t = build([bolsa], {
      payments: [
        { method: "EFECTIVO", amount: 6000 },
        { method: "TARJETA_CREDITO", amount: 10000 },
      ],
      surchargePct: 10,
    });
    expect(t.surchargePct).toBe(10);
    expect(t.surchargeAmount).toBe(1000);
    expect(t.total).toBe(17000);
    // Σ pagos == total: la fila de tarjeta muestra lo efectivamente cobrado.
    expect(t.payments).toEqual([
      { methodLabel: "Efectivo", amount: 6000 },
      { methodLabel: "Tarjeta de crédito", amount: 11000 },
    ]);
  });

  it("recargo + descuento: total = subtotal − descuento + recargo", () => {
    const t = build([bolsa], {
      discountPct: 10,
      payments: [{ method: "TARJETA_CREDITO", amount: 14400 }],
      surchargePct: 5,
    });
    expect(t.discountAmount).toBe(1600);
    expect(t.surchargeAmount).toBe(720);
    expect(t.total).toBe(15120);
  });

  it("recargo sin fila de tarjeta: se ignora (0)", () => {
    const t = build([bolsa], {
      payments: [{ method: "EFECTIVO", amount: 16000 }],
      surchargePct: 10,
    });
    expect(t.surchargePct).toBe(0);
    expect(t.surchargeAmount).toBe(0);
    expect(t.total).toBe(16000);
  });

  it("lista los pagos con la etiqueta visible del método", () => {
    const t = build([bolsa], {
      payments: [
        { method: "EFECTIVO", amount: 10000 },
        { method: "TARJETA_DEBITO", amount: 6000 },
      ],
    });
    expect(t.payments).toEqual([
      { methodLabel: "Efectivo", amount: 10000 },
      { methodLabel: "Tarjeta de débito", amount: 6000 },
    ]);
  });

  it("sin pagos declarados: lista vacía", () => {
    const t = build([bolsa], { payments: undefined });
    expect(t.payments).toEqual([]);
  });

  it("nombre del negocio vacío o nulo cae en 'Pullstok'", () => {
    expect(build([bolsa], { businessName: "" }).businessName).toBe("Pullstok");
    expect(build([bolsa], { businessName: null }).businessName).toBe("Pullstok");
    expect(build([bolsa], { businessName: "  Kiosco  " }).businessName).toBe("Kiosco");
  });

  it("issuedAt se guarda como ISO string", () => {
    expect(build([bolsa]).issuedAt).toBe(ISSUED_AT.toISOString());
  });
});

describe("renderSaleTicketHtml", () => {
  it("define papel continuo de 58 mm y el pie 'no válido como factura'", () => {
    const html = renderSaleTicketHtml(build([bolsa]));
    expect(html).toContain("@page");
    expect(html).toContain("size: 58mm auto");
    expect(html).toContain("margin: 0");
    expect(html).toContain("Ticket no válido como factura");
    expect(html).toContain("Gracias por su compra");
  });

  it("el contenido cabe en el área imprimible: el driver ensancha ~17% y el papel corta el borde derecho", () => {
    // Medido en papel real (OCOM 58 mm): con body de 48mm los importes perdían
    // el último dígito ($18.100 → $18.10). Contenido máximo ~40mm de CSS.
    const html = renderSaleTicketHtml(build([bolsa]));
    const width = /body \{[^}]*?\bwidth: (\d+(?:\.\d+)?)mm/.exec(html);
    expect(width).not.toBeNull();
    expect(Number(width![1])).toBeLessThanOrEqual(41);
  });

  it("el detalle del renglón se recorta con elipsis en vez de empujar el total fuera del papel", () => {
    const html = renderSaleTicketHtml(build([bolsa]));
    expect(html).toMatch(/\.row > span:first-child \{[^}]*text-overflow: ellipsis/);
    expect(html).toMatch(/\.row > span:last-child \{[^}]*white-space: nowrap/);
  });

  it("incluye negocio, fecha/hora es-AR, líneas, total y pagos", () => {
    const html = renderSaleTicketHtml(
      build([bolsa], { payments: [{ method: "QR", amount: 16000 }] }),
    );
    expect(html).toContain("Mi Pet Shop");
    expect(html).toContain("24/09/2026 15:30");
    expect(html).toContain("Royal Canin Adulto 15kg");
    expect(html).toContain("2 x $8.000");
    expect(html).toContain("$16.000");
    expect(html).toContain("TOTAL");
    expect(html).toContain("QR");
  });

  it("descuento 0: no muestra subtotal ni descuento", () => {
    const html = renderSaleTicketHtml(build([bolsa]));
    expect(html).not.toContain("Subtotal");
    expect(html).not.toContain("Descuento");
  });

  it("descuento > 0: muestra subtotal, descuento (% e importe) y total", () => {
    const html = renderSaleTicketHtml(build([bolsa], { discountPct: 10 }));
    expect(html).toContain("Subtotal");
    expect(html).toContain("Descuento 10%");
    expect(html).toContain("-$1.600");
    expect(html).toContain("$14.400");
  });

  it("recargo 0: no muestra la fila de recargo", () => {
    const html = renderSaleTicketHtml(build([bolsa]));
    expect(html).not.toContain("Recargo");
  });

  it("recargo > 0: fila de recargo después del descuento y TOTAL con recargo", () => {
    const html = renderSaleTicketHtml(
      build([bolsa], {
        discountPct: 10,
        payments: [{ method: "TARJETA_CREDITO", amount: 14400 }],
        surchargePct: 5,
      }),
    );
    expect(html).toContain("Recargo tarjeta 5%");
    expect(html).toContain("+$720");
    expect(html).toContain("$15.120");
    expect(html.indexOf("Descuento 10%")).toBeLessThan(html.indexOf("Recargo tarjeta 5%"));
    expect(html.indexOf("Recargo tarjeta 5%")).toBeLessThan(html.indexOf("TOTAL"));
  });

  it("escapa el texto interpolado (nombre de producto y del negocio)", () => {
    const html = renderSaleTicketHtml(
      build(
        [{ name: "<script>alert(1)</script>", price: 1, quantity: 1 }],
        { businessName: 'A&B "Pets" <b>' },
      ),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B &quot;Pets&quot; &lt;b&gt;");
  });

  it("layout compacto: 40 ítems → 2 líneas por ítem, sin filas vacías ni separadores entre ítems", () => {
    const items: SaleTicketItem[] = Array.from({ length: 40 }, (_, i) => ({
      name: `Producto con un nombre bastante largo número ${i + 1} para probar recorte`,
      price: 1000 + i,
      quantity: 1 + (i % 3),
      saleMode: "BOLSA_CERRADA",
    }));
    const html = renderSaleTicketHtml(build(items));
    const doc = new DOMParser().parseFromString(html, "text/html");

    const list = doc.querySelector('[data-block="items"]');
    expect(list).not.toBeNull();
    const rows = Array.from(list!.children);
    expect(rows).toHaveLength(40);

    for (const row of rows) {
      // Cada ítem: nombre (1 línea, recortado) + fila de detalle/total.
      expect(row.classList.contains("item")).toBe(true);
      expect(row.children).toHaveLength(2);
      const name = row.querySelector(".name")!;
      expect(name.textContent!.length).toBeLessThanOrEqual(28);
      expect(name.textContent!.trim()).not.toBe("");
      expect(row.querySelector("br")).toBeNull();
      const detailRow = row.querySelector(".row")!;
      expect(detailRow.children).toHaveLength(2); // detalle + total a la derecha
    }

    // Solo hay 2 separadores en todo el ticket: sobre ítems y sobre totales.
    expect(doc.querySelectorAll(".sep, hr")).toHaveLength(2);
    // Sin alturas fijas ni saltos de página que agreguen papel en blanco.
    expect(html).not.toMatch(/page-break/);
    expect(html).not.toMatch(/(^|[^-\w])height\s*:\s*\d/);
  });
});

describe("logo del ticket", () => {
  const LOGO = "https://cdn.example.com/logo.png";

  it("con logoUrl: el encabezado lleva un <img> centrado en escala de grises", () => {
    const t = build([bolsa], { logoUrl: LOGO });
    expect(t.logoUrl).toBe(LOGO);
    const html = renderSaleTicketHtml(t);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = doc.querySelector("header img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(LOGO);
    // 34mm: entra en el contenido de 38mm del ticket (ver STYLES).
    expect(html).toContain("max-width: 34mm");
    expect(html).toContain("max-height: 16mm");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("grayscale(1)");
    // Sin procesar (URL cruda) usa el filtro CSS de respaldo vía la clase raw.
    expect(img.classList.contains("raw")).toBe(true);
    // Ya procesado (canvas) no se le aplica de nuevo.
    const processed = renderSaleTicketHtml({ ...t, logoProcessed: true });
    expect(
      new DOMParser().parseFromString(processed, "text/html").querySelector("header img")!
        .classList.contains("raw"),
    ).toBe(false);
    // El nombre del negocio sigue como línea chica debajo del logo.
    expect(doc.querySelector("header")!.textContent).toContain("Mi Pet Shop");
  });

  it("sin logoUrl: no hay <img> (solo el nombre del negocio)", () => {
    for (const logoUrl of [undefined, null, ""]) {
      const html = renderSaleTicketHtml(build([bolsa], { logoUrl }));
      expect(html).not.toContain("<img");
      expect(html).toContain("Mi Pet Shop");
    }
  });

  it("descarta URLs peligrosas (javascript:, data no imagen, file:)", () => {
    for (const bad of [
      "javascript:alert(1)",
      "  JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "file:///etc/passwd",
    ]) {
      const t = build([bolsa], { logoUrl: bad });
      expect(t.logoUrl).toBeNull();
      expect(renderSaleTicketHtml(t)).not.toContain("<img");
    }
    // Un ticket armado a mano con URL insegura tampoco la inyecta.
    const manual: SaleTicket = { ...build([bolsa]), logoUrl: "javascript:alert(1)" };
    expect(renderSaleTicketHtml(manual)).not.toContain("javascript:");
  });

  it("acepta data:image y resuelve URLs relativas contra el origen de la app", () => {
    const dataImg = "data:image/png;base64,iVBORw0KGgo=";
    expect(build([bolsa], { logoUrl: dataImg }).logoUrl).toBe(dataImg);
    expect(build([bolsa], { logoUrl: "/uploads/logo.png" }).logoUrl).toBe(
      `${window.location.origin}/uploads/logo.png`,
    );
  });

  it("escapa la URL al inyectarla en el atributo src", () => {
    const html = renderSaleTicketHtml(
      build([bolsa], { logoUrl: 'https://x.test/a.png?q="><script>1</script>' }),
    );
    expect(html).not.toContain("<script>");
  });
});

describe("datos de la empresa en el encabezado", () => {
  const company = {
    taxId: "30-12345678-9",
    taxCondition: "IVA Responsable Inscripto",
    address: "Av. Siempre Viva 742, Rosario",
    phone: "341-5551234",
  };

  const headerLines = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("header > div")).map((d) => d.textContent ?? "");
  };

  it("imprime CUIT, condición, dirección y teléfono cuando existen", () => {
    const html = renderSaleTicketHtml(build([bolsa], company));
    const lines = headerLines(html);
    expect(lines).toContain("CUIT: 30-12345678-9");
    expect(lines).toContain("IVA Responsable Inscripto");
    expect(lines).toContain("Av. Siempre Viva 742, Rosario");
    expect(lines).toContain("Tel: 341-5551234");
    // nombre + 4 datos + fecha
    expect(lines).toHaveLength(6);
  });

  it("omite los campos vacíos: sin líneas en blanco ni 'null'/'undefined'", () => {
    const html = renderSaleTicketHtml(
      build([bolsa], {
        taxId: "30-1",
        taxCondition: "  ",
        address: null,
        phone: undefined,
      }),
    );
    const lines = headerLines(html);
    expect(lines).toContain("CUIT: 30-1");
    expect(lines.every((l) => l.trim() !== "")).toBe(true);
    expect(lines).toHaveLength(3); // nombre + CUIT + fecha
    expect(html).not.toMatch(/null|undefined/);
    expect(html).not.toContain("Tel:");
  });

  it("sin ningún dato: el encabezado queda con nombre y fecha", () => {
    expect(headerLines(renderSaleTicketHtml(build([bolsa])))).toHaveLength(2);
  });

  it("escapa los datos de la empresa", () => {
    const html = renderSaleTicketHtml(
      build([bolsa], {
        taxId: "<img src=x onerror=1>",
        taxCondition: "<b>RI</b>",
        address: "Calle <script>1</script> & Co",
        phone: '"><i>',
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;b&gt;RI&lt;/b&gt;");
    expect(html).toContain("&amp; Co");
  });

  it("acota una dirección larguísima a ~2 líneas", () => {
    const long = "Calle ".repeat(60);
    const lines = headerLines(renderSaleTicketHtml(build([bolsa], { address: long })));
    const addr = lines.find((l) => l.startsWith("Calle"))!;
    expect(addr.length).toBeLessThanOrEqual(64);
  });

  describe("resolveTicketCompany", () => {
    const org = {
      taxId: "30-1",
      taxCondition: "Monotributo",
      address: "Dirección org",
      phone: "111",
    };

    it("la dirección y el teléfono de la sucursal ganan sobre los de la organización", () => {
      const c = resolveTicketCompany({
        businessName: "Neg",
        org,
        branch: { address: "Dirección sucursal", phone: "222" },
      });
      expect(c.address).toBe("Dirección sucursal");
      expect(c.phone).toBe("222");
      expect(c.taxId).toBe("30-1");
      expect(c.taxCondition).toBe("Monotributo");
    });

    it("cae en los de la organización por campo si la sucursal no los tiene", () => {
      const c = resolveTicketCompany({
        org,
        branch: { address: "", phone: null },
      });
      expect(c.address).toBe("Dirección org");
      expect(c.phone).toBe("111");
      const d = resolveTicketCompany({
        org,
        branch: { address: "Solo dirección", phone: null },
      });
      expect(d.address).toBe("Solo dirección");
      expect(d.phone).toBe("111");
    });

    it("sin sucursal ni organización devuelve campos nulos", () => {
      const c = resolveTicketCompany({});
      expect(c.address).toBeNull();
      expect(c.phone).toBeNull();
      expect(c.taxId).toBeNull();
    });
  });
});

describe("printSaleTicket", () => {
  beforeEach(() => {
    vi.mocked(prepareTicketLogo).mockReset();
    // Por defecto el logo "no se pudo procesar": vuelve la URL original.
    vi.mocked(prepareTicketLogo).mockImplementation(async (url) => url);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function getIframe(): HTMLIFrameElement | null {
    return document.body.querySelector("iframe");
  }

  it("crea un iframe oculto, imprime al cargar y lo limpia con afterprint", () => {
    const ticket = build([bolsa]);
    printSaleTicket(ticket);

    const iframe = getIframe()!;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute("aria-hidden")).toBe("true");

    const win = iframe.contentWindow!;
    const print = vi.fn();
    const focus = vi.fn();
    win.print = print;
    win.focus = focus;

    iframe.dispatchEvent(new Event("load"));
    // Un segundo load (p.ej. el propio del navegador) no vuelve a imprimir.
    iframe.dispatchEvent(new Event("load"));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(getIframe()).not.toBeNull();

    win.dispatchEvent(new Event("afterprint"));
    expect(getIframe()).toBeNull();
  });

  it("el documento del iframe contiene el HTML del ticket", () => {
    printSaleTicket(build([bolsa]));
    const iframe = getIframe()!;
    expect(iframe.contentDocument!.body.textContent).toContain("Royal Canin Adulto 15kg");
    expect(iframe.contentDocument!.documentElement.innerHTML).toContain("size: 58mm auto");
  });

  it("si afterprint nunca llega, el timeout de seguridad quita el iframe", () => {
    vi.useFakeTimers();
    printSaleTicket(build([bolsa]));
    const iframe = getIframe()!;
    iframe.contentWindow!.print = vi.fn();
    iframe.contentWindow!.focus = vi.fn();
    iframe.dispatchEvent(new Event("load"));
    expect(getIframe()).not.toBeNull();

    vi.advanceTimersByTime(120_000);
    expect(getIframe()).toBeNull();
  });

  describe("con logo", () => {
    const LOGO = "https://cdn.example.com/logo.png";

    async function setup() {
      await printSaleTicket(build([bolsa], { logoUrl: LOGO }));
      const iframe = getIframe()!;
      const win = iframe.contentWindow!;
      const print = vi.fn();
      win.print = print;
      win.focus = vi.fn();
      const img = iframe.contentDocument!.querySelector("img")!;
      // jsdom no descarga imágenes: simulamos una carga en curso.
      Object.defineProperty(img, "complete", { value: false, configurable: true });
      return { iframe, img, print };
    }

    it("espera a que cargue el logo antes de imprimir", async () => {
      const { iframe, img, print } = await setup();
      iframe.dispatchEvent(new Event("load"));
      expect(print).not.toHaveBeenCalled();

      img.dispatchEvent(new Event("load"));
      expect(print).toHaveBeenCalledTimes(1);
      expect(iframe.contentDocument!.querySelector("img")).not.toBeNull();
    });

    it("si el logo falla, lo quita e imprime igual", async () => {
      const { iframe, img, print } = await setup();
      iframe.dispatchEvent(new Event("load"));
      img.dispatchEvent(new Event("error"));
      expect(print).toHaveBeenCalledTimes(1);
      expect(iframe.contentDocument!.querySelector("img")).toBeNull();
    });

    it("si el logo tarda más de ~3 s, lo quita e imprime igual", async () => {
      vi.useFakeTimers();
      const { iframe, print } = await setup();
      iframe.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(2900);
      expect(print).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(print).toHaveBeenCalledTimes(1);
      expect(iframe.contentDocument!.querySelector("img")).toBeNull();
    });

    it("si el logo ya estaba cargado imprime de inmediato", async () => {
      await printSaleTicket(build([bolsa], { logoUrl: LOGO }));
      const iframe = getIframe()!;
      const print = vi.fn();
      iframe.contentWindow!.print = print;
      iframe.contentWindow!.focus = vi.fn();
      const img = iframe.contentDocument!.querySelector("img")!;
      Object.defineProperty(img, "complete", { value: true, configurable: true });
      iframe.dispatchEvent(new Event("load"));
      expect(print).toHaveBeenCalledTimes(1);
    });

    it("usa el logo procesado (data URL) y ya no aplica el filtro CSS de respaldo", async () => {
      const PROCESSED = "data:image/png;base64,QUJD";
      vi.mocked(prepareTicketLogo).mockResolvedValue(PROCESSED);
      await printSaleTicket(build([bolsa], { logoUrl: LOGO }));
      const iframe = getIframe()!;
      const img = iframe.contentDocument!.querySelector("img")!;

      expect(prepareTicketLogo).toHaveBeenCalledWith(LOGO);
      expect(img.getAttribute("src")).toBe(PROCESSED);
      expect(img.classList.contains("raw")).toBe(false);
    });

    it("si no se pudo procesar, usa la URL original con el filtro CSS (clase raw)", async () => {
      await printSaleTicket(build([bolsa], { logoUrl: LOGO })); // mock: devuelve la misma URL
      const img = getIframe()!.contentDocument!.querySelector("img")!;
      expect(img.getAttribute("src")).toBe(LOGO);
      expect(img.classList.contains("raw")).toBe(true);
    });

    it("el logo procesado sobrevive a whenImagesReady (no se quita y se imprime)", async () => {
      vi.mocked(prepareTicketLogo).mockResolvedValue("data:image/png;base64,QUJD");
      await printSaleTicket(build([bolsa], { logoUrl: LOGO }));
      const iframe = getIframe()!;
      const print = vi.fn();
      iframe.contentWindow!.print = print;
      iframe.contentWindow!.focus = vi.fn();
      const img = iframe.contentDocument!.querySelector("img")!;
      Object.defineProperty(img, "complete", { value: false, configurable: true });
      iframe.dispatchEvent(new Event("load"));
      img.dispatchEvent(new Event("load"));
      expect(print).toHaveBeenCalledTimes(1);
      expect(iframe.contentDocument!.querySelector("img")).not.toBeNull();
    });

    it("sin logo no se invoca el pre-proceso", async () => {
      await printSaleTicket(build([bolsa]));
      expect(prepareTicketLogo).not.toHaveBeenCalled();
    });

    it("si el pre-proceso lanza igual imprime con la URL original", async () => {
      vi.mocked(prepareTicketLogo).mockRejectedValue(new Error("boom"));
      await expect(printSaleTicket(build([bolsa], { logoUrl: LOGO }))).resolves.toBeUndefined();
      expect(getIframe()!.contentDocument!.querySelector("img")!.getAttribute("src")).toBe(LOGO);
    });
  });

  it("sin window (SSR) no falla", async () => {
    const win = globalThis.window;
    // @ts-expect-error simulamos entorno sin window
    delete globalThis.window;
    try {
      await expect(printSaleTicket(build([bolsa]))).resolves.toBeUndefined();
    } finally {
      globalThis.window = win;
    }
  });
});
