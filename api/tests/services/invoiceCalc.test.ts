import { calculateInvoiceTotals } from '../../src/services/invoiceCalc';

describe('calculateInvoiceTotals', () => {
  it('calcula subtotal/taxAmount/totalAmount con alícuotas mixtas (21/10.5/0)', () => {
    const result = calculateInvoiceTotals([
      { description: 'Servicio A', quantity: 2, unitPrice: 100, taxRate: 21 },
      { description: 'Servicio B', quantity: 1, unitPrice: 200, taxRate: 10.5 },
      { description: 'Servicio C', quantity: 3, unitPrice: 50, taxRate: 0 },
    ]);

    // lineTotal: 200, 200, 150 → subtotal 550
    expect(result.subtotal).toBeCloseTo(550, 5);
    // taxAmount: 200*0.21 + 200*0.105 + 150*0 = 42 + 21 + 0 = 63
    expect(result.taxAmount).toBeCloseTo(63, 5);
    expect(result.totalAmount).toBeCloseTo(613, 5);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].lineTotal).toBeCloseTo(200, 5);
    expect(result.items[1].lineTotal).toBeCloseTo(200, 5);
    expect(result.items[2].lineTotal).toBeCloseTo(150, 5);
  });

  it('maneja líneas con cantidad o precio en 0 sin romper el cálculo', () => {
    const result = calculateInvoiceTotals([
      { description: 'Gratis', quantity: 0, unitPrice: 100, taxRate: 21 },
      { description: 'Sin precio', quantity: 5, unitPrice: 0, taxRate: 21 },
    ]);

    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it('devuelve totales en 0 para una lista vacía de líneas', () => {
    const result = calculateInvoiceTotals([]);

    expect(result.items).toHaveLength(0);
    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it('calcula correctamente una única línea con alícuota 21 (caso simple)', () => {
    const result = calculateInvoiceTotals([
      { description: 'Consultoría', quantity: 1, unitPrice: 1000, taxRate: 21 },
    ]);

    expect(result.subtotal).toBe(1000);
    expect(result.taxAmount).toBeCloseTo(210, 5);
    expect(result.totalAmount).toBeCloseTo(1210, 5);
  });
});
