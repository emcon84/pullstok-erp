import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrintInvoice } from "@/components/molecules/PrintInvoice";
import type { InvoicePdfData } from "@/utils/exportToPDF";

const fiscalData: InvoicePdfData = {
  title: "Factura",
  documentNumber: "0002-00000013",
  date: "21/08/2026",
  customer: "ACME S.A.",
  issuer: {
    name: "Mi Empresa S.R.L.",
    taxId: "30-12345678-9",
    taxCondition: "IVA Responsable Inscripto",
    address: "Av. Siempre Viva 123",
  },
  customerTaxId: "30-98765432-1",
  customerTaxCondition: "IVA Responsable Inscripto",
  customerAddress: "Calle Falsa 456",
  items: [
    {
      quantity: 2,
      name: "Servicio de consultoría",
      price: 50000,
      taxRate: 21,
      total: 100000,
    },
  ],
  subtotal: 100000,
  taxAmount: 21000,
  total: 121000,
  tipoComprobante: "1",
  puntoVenta: 2,
  cbteNro: 13,
  cae: "71907643210631",
  caeVencimiento: "2026-11-21",
};

describe("PrintInvoice — comprobante fiscal (CAE presente)", () => {
  it("renderiza marco, ORIGINAL, emisor, receptor, items y totales", () => {
    render(<PrintInvoice {...fiscalData} />);

    // Rótulo ORIGINAL + letra + título + número fiscal
    expect(screen.getByText("ORIGINAL")).toBeInTheDocument();
    expect(screen.getByText("(A)")).toBeInTheDocument();
    expect(screen.getByText("FACTURA A")).toBeInTheDocument();
    expect(screen.getByText(/fac-A-0002-00000013/)).toBeInTheDocument();

    // Emisor
    expect(screen.getByText("Mi Empresa S.R.L.")).toBeInTheDocument();
    expect(screen.getByText("Razón Social: Mi Empresa S.R.L.")).toBeInTheDocument();
    expect(screen.getByText("Domicilio: Av. Siempre Viva 123")).toBeInTheDocument();
    expect(
      screen.getByText("Condición IVA: IVA Responsable Inscripto"),
    ).toBeInTheDocument();
    expect(screen.getByText("CUIT: 30-12345678-9")).toBeInTheDocument();

    // Receptor
    expect(screen.getByText(/Cliente:/)).toBeInTheDocument();
    expect(screen.getByText(/CUIT\/DNI:/)).toBeInTheDocument();
    expect(screen.getByText("30-98765432-1")).toBeInTheDocument();

    // Items y totales
    expect(screen.getByText("Servicio de consultoría")).toBeInTheDocument();
    expect(screen.getAllByText("$ 121.000,00").length).toBeGreaterThan(0);
  });

  it("muestra el logo del emisor cuando viene", () => {
    render(<PrintInvoice {...fiscalData} logoUrl="https://cdn.example/logo.png" />);

    const logo = screen.getByTestId("print-invoice-logo") as HTMLImageElement;
    expect(logo.src).toBe("https://cdn.example/logo.png");
  });

  it("tabla con 7 columnas y filas vacías de relleno", () => {
    render(<PrintInvoice {...fiscalData} />);

    ["Código", "Descripción", "Cantidad", "Precio Unit", "Descuento", "Alícuota %", "Total"].forEach(
      (h) => expect(screen.getByText(h)).toBeInTheDocument(),
    );
    // 1 ítem real + 4 filas vacías = 5 filas de body
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
  });
});

describe("PrintInvoice — zona CAE", () => {
  it("sin canvas (jsdom) cae al fallback: CAE como texto grande, sin romper", () => {
    render(<PrintInvoice {...fiscalData} />);

    expect(screen.getByText("CAE Nro:")).toBeInTheDocument();
    expect(screen.getAllByText("71907643210631").length).toBeGreaterThan(0);
    expect(screen.getByText("Fecha Vto CAE:")).toBeInTheDocument();
    expect(screen.getByText("21/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Comprobante Autorizado")).toBeInTheDocument();

    const fallback = screen.getByTestId("print-invoice-cae-fallback");
    expect(fallback.textContent).toBe("71907643210631");
    expect(screen.queryByTestId("print-invoice-qr")).not.toBeInTheDocument();
  });

  it("con canvas disponible renderiza el QR como <img>", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,FAKEQR",
    );

    render(<PrintInvoice {...fiscalData} />);

    const qr = screen.getByTestId("print-invoice-qr") as HTMLImageElement;
    expect(qr.src).toBe("data:image/png;base64,FAKEQR");
    expect(screen.queryByTestId("print-invoice-cae-fallback")).not.toBeInTheDocument();
  });
});

describe("PrintInvoice — sin CAE", () => {
  it("muestra la leyenda 'Comprobante no fiscal' y no renderiza la zona CAE", () => {
    const { cae, caeVencimiento, tipoComprobante, puntoVenta, cbteNro, ...generic } =
      fiscalData;
    void cae;
    void caeVencimiento;
    void tipoComprobante;
    void puntoVenta;
    void cbteNro;

    render(<PrintInvoice {...generic} />);

    expect(
      screen.getByText("Comprobante no fiscal — no válido como factura AFIP"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Comprobante Autorizado")).not.toBeInTheDocument();
    expect(screen.queryByTestId("print-invoice-qr")).not.toBeInTheDocument();
    expect(screen.queryByTestId("print-invoice-cae-fallback")).not.toBeInTheDocument();
  });
});