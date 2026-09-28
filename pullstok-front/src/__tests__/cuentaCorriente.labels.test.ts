import { describe, it, expect } from "vitest";
import {
  CHECKOUT_PAYMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/models/cashSessionModel";
import { buildSaleTicket, renderSaleTicketHtml } from "@/utils/saleTicket";
import { encodeSaleTicketEscPos } from "@/utils/escpos";

describe("CUENTA_CORRIENTE — payment method catalog", () => {
  it("has the label 'Cuenta corriente'", () => {
    expect(PAYMENT_METHOD_LABELS.CUENTA_CORRIENTE).toBe("Cuenta corriente");
  });

  it("is offered at checkout but stays out of the arqueo / legacy method list", () => {
    expect(CHECKOUT_PAYMENT_METHODS).toContain("CUENTA_CORRIENTE");
    expect(PAYMENT_METHODS).not.toContain("CUENTA_CORRIENTE");
    expect(CHECKOUT_PAYMENT_METHODS).toEqual([...PAYMENT_METHODS, "CUENTA_CORRIENTE"]);
  });
});

describe("CUENTA_CORRIENTE — ticket", () => {
  const ticket = buildSaleTicket({
    issuedAt: "2026-09-28T10:00:00",
    items: [{ name: "Royal Canin 15kg", price: 1000, quantity: 1 }],
    payments: [
      { method: "EFECTIVO", amount: 600 },
      { method: "CUENTA_CORRIENTE", amount: 400 },
    ],
  });

  it("carries the label in the payment lines", () => {
    expect(ticket.payments.map((p) => p.methodLabel)).toEqual([
      "Efectivo",
      "Cuenta corriente",
    ]);
  });

  it("prints the label in the HTML ticket", () => {
    expect(renderSaleTicketHtml(ticket)).toContain("Cuenta corriente");
  });

  it("prints the label in the ESC/POS ticket", () => {
    const bytes = encodeSaleTicketEscPos(ticket);
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    expect(text).toContain("Cuenta corriente");
  });
});
