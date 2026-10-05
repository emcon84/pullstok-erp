import { describe, it, expect } from "vitest";
import { saleToTicket } from "@/utils/saleToTicket";
import { renderSaleTicketHtml } from "@/utils/saleTicket";
import { encodeSaleTicketEscPos } from "@/utils/escpos";
import type { Sale } from "@/models/salesModel";

// Reimpresión: una venta GUARDADA (Sale del backend) se convierte en el mismo
// SaleTicket del momento de la venta, con la fecha original y la marca de reimpresión.

const SALE_DATE = new Date(2026, 8, 24, 15, 30, 0).toISOString();

const baseSale = (over: Partial<Sale> = {}): Sale => ({
  id: "s1",
  saleDate: SALE_DATE,
  totalAmount: 16000,
  items: [
    { name: "Royal Canin Adulto 15kg", quantity: 2, price: 8000, category: "Alimento", saleMode: "BOLSA_CERRADA", productId: "p1" },
  ],
  payments: [{ method: "EFECTIVO", amount: 16000 }],
  ...over,
});

describe("saleToTicket", () => {
  it("usa la fecha ORIGINAL de la venta y marca la reimpresión", () => {
    const t = saleToTicket(baseSale());
    expect(t.issuedAt).toBe(SALE_DATE);
    expect(t.reprint).toBe(true);
  });

  it("bolsa cerrada: mismo detalle que el ticket original", () => {
    const t = saleToTicket(baseSale());
    expect(t.lines).toEqual([
      { label: "Royal Canin Adulto 15kg", detail: "2 x $8.000", total: 16000 },
    ]);
    expect(t.subtotal).toBe(16000);
    expect(t.total).toBe(16000);
    expect(t.payments).toEqual([{ methodLabel: "Efectivo", amount: 16000 }]);
  });

  it("POR_PESO: kg x precio/kg", () => {
    const t = saleToTicket(
      baseSale({
        totalAmount: 6000,
        items: [{ name: "Pro Plan · Adulto", quantity: 1.5, price: 4000, category: "Suelto", saleMode: "POR_PESO", productId: null, loosePriceId: "c1" }],
        payments: [{ method: "EFECTIVO", amount: 6000 }],
      }),
    );
    expect(t.lines[0]).toEqual({ label: "Pro Plan · Adulto", detail: "1,50 kg x $4.000/kg", total: 6000 });
  });

  it("POR_MONTO guardado (kg x precio): muestra monto y kg como el ticket original", () => {
    const t = saleToTicket(
      baseSale({
        totalAmount: 2000,
        items: [{ name: "Pro Plan · Adulto", quantity: 0.5, price: 4000, category: "Suelto", saleMode: "POR_MONTO", productId: null, loosePriceId: "c1" }],
        payments: [{ method: "EFECTIVO", amount: 2000 }],
      }),
    );
    expect(t.lines[0]).toEqual({ label: "Pro Plan · Adulto", detail: "$2.000 (0,500 kg)", total: 2000 });
  });

  it("POR_UNIDAD: cantidad x precio por unidad", () => {
    const t = saleToTicket(
      baseSale({
        totalAmount: 1500,
        items: [{ name: "Pouch gato", quantity: 3, price: 500, category: "Pouch", saleMode: "POR_UNIDAD", productId: "p2" }],
        payments: [{ method: "EFECTIVO", amount: 1500 }],
      }),
    );
    expect(t.lines[0]).toEqual({ label: "Pouch gato", detail: "3 x $500", total: 1500 });
  });

  it("venta libre (POR_PESO sin producto ni celda): peso en gramos y total exacto", () => {
    const t = saleToTicket(
      baseSale({
        totalAmount: 1000,
        items: [{ name: "Alimento suelto", quantity: 0.35, price: 1000 / 0.35, category: "Venta libre", saleMode: "POR_PESO", productId: null }],
        payments: [{ method: "EFECTIVO", amount: 1000 }],
      }),
    );
    expect(t.lines[0]).toEqual({ label: "Alimento suelto", detail: "350 g", total: 1000 });
  });

  it("descuento: usa el monto guardado y deriva el %", () => {
    const t = saleToTicket(baseSale({ discount: 1600, totalAmount: 14400, payments: [{ method: "EFECTIVO", amount: 14400 }] }));
    expect(t.subtotal).toBe(16000);
    expect(t.discountAmount).toBe(1600);
    expect(t.discountPct).toBe(10);
    expect(t.total).toBe(14400);
  });

  it("recargo de tarjeta: monto guardado, % derivado y pagos tal cual (ya incluyen recargo)", () => {
    const t = saleToTicket(
      baseSale({
        surcharge: 800,
        totalAmount: 16800,
        payments: [{ method: "TARJETA_CREDITO", amount: 16800 }],
      }),
    );
    expect(t.surchargeAmount).toBe(800);
    expect(t.surchargePct).toBe(5);
    expect(t.total).toBe(16800);
    expect(t.payments).toEqual([{ methodLabel: "Tarjeta de crédito", amount: 16800 }]);
  });

  it("aplica el encabezado de empresa recibido", () => {
    const t = saleToTicket(baseSale(), { businessName: "Mi Pet Shop", taxId: "30-1", phone: "11 2233" });
    expect(t.businessName).toBe("Mi Pet Shop");
    expect(t.taxId).toBe("30-1");
    expect(t.phone).toBe("11 2233");
  });

  it("venta legacy sin pagos ni descuento: no rompe", () => {
    const t = saleToTicket(baseSale({ payments: undefined }));
    expect(t.payments).toEqual([]);
    expect(t.discountAmount).toBe(0);
    expect(t.surchargeAmount).toBe(0);
  });

  it("cae a `products` si la venta no trae `items`", () => {
    const t = saleToTicket(
      baseSale({ items: undefined, products: [{ name: "Collar", quantity: 1, price: 16000 }] }),
    );
    expect(t.lines).toEqual([{ label: "Collar", detail: "1 x $16.000", total: 16000 }]);
  });
});

describe("marca REIMPRESIÓN en los renderers", () => {
  it("HTML: el original no la tiene, la reimpresión sí", () => {
    const t = saleToTicket(baseSale());
    expect(renderSaleTicketHtml(t)).toContain("REIMPRESI");
    expect(renderSaleTicketHtml({ ...t, reprint: false })).not.toContain("REIMPRESI");
  });

  it("ESC/POS: la reimpresión incluye el texto (ASCII)", () => {
    const t = saleToTicket(baseSale());
    const text = (b: Uint8Array) => Array.from(b).map((c) => String.fromCharCode(c)).join("");
    expect(text(encodeSaleTicketEscPos(t))).toContain("REIMPRESION");
    expect(text(encodeSaleTicketEscPos({ ...t, reprint: false }))).not.toContain("REIMPRESION");
  });

  it("presentation lines are labelled with the presentationName snapshot", () => {
    const t = saleToTicket(
      baseSale({
        totalAmount: 300,
        items: [
          { name: "Ibuprofeno", quantity: 2, price: 150, category: "", saleMode: "BOLSA_CERRADA", productId: "p1", presentationName: "Blister" },
        ],
      }),
    );
    expect(t.lines[0]).toEqual({ label: "Ibuprofeno (Blister)", detail: "2 x $150", total: 300 });
  });
});
