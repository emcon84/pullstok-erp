import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VendorCartSheet } from "@/components/molecules/VendorCartSheet";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";

/**
 * Checkout con medios de pago (sdd/caja-apertura-cierre R6-R8, R10).
 *
 * El POS (VendorCartSheet) declara payments[] por método, calcula el vuelto
 * (solo EFECTIVO, no se persiste) y al confirmar pasa el payload
 * { payments, cashSessionId } al handler. Cubre:
 *  - vuelto = round2(recibido - total) solo cuando hay efectivo de más
 *  - payload default EFECTIVO por el total cuando no se declara nada
 *  - payments declarados + cashSessionId se propagan a confirmSale
 */

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// NativeSelect usa shadcn Select en jsdom (sin matchMedia). Lo mockeamos para
// controlar el método seleccionado de forma determinista.
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    id,
    value,
    onValueChange,
    options,
  }: {
    id?: string;
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const item: VendorCartItem = {
  productId: "p1",
  code: "P1",
  branchId: "b1",
  name: "Producto Test",
  price: 100,
  quantity: 2,
  stock: 10,
  saleMode: "BOLSA_CERRADA",
};

function renderSheet(confirmSale: (p?: unknown[], csId?: string) => void) {
  return render(
    <VendorCartSheet
      open
      cart={{ items: [item], totalAmount: 200 }}
      status={{ confirming: false, savingOrder: false }}
      handlers={{
        onOpenChange: vi.fn(),
        updateQty: vi.fn(),
        remove: vi.fn(),
        clearCart: vi.fn(),
        saveOrder: vi.fn(),
        confirmSale,
      }}
      cashSessionId="cs-1"
    />,
  );
}

describe("VendorCartSheet — medios de pago (R6-R8, R10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el selector de método y el campo de efectivo recibido", () => {
    renderSheet(vi.fn());
    expect(screen.getByText("Medio de pago")).toBeInTheDocument();
    expect(screen.getByLabelText("Efectivo recibido")).toBeInTheDocument();
    // Tras declarar un pago se muestra el desglose con "Total pagado".
    fireEvent.change(screen.getByLabelText("Efectivo recibido"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByText("Agregar pago (Efectivo)"));
    expect(screen.getByText("Total pagado")).toBeInTheDocument();
  });

  it("muestra vuelto = round2(recibido - total) solo con efectivo de más", () => {
    renderSheet(vi.fn());
    fireEvent.change(screen.getByLabelText("Efectivo recibido"), {
      target: { value: "500" },
    });
    // 500 - 200 = 300
    expect(screen.getByText("Vuelto")).toBeInTheDocument();
    expect(screen.getByText("$300,00")).toBeInTheDocument();
  });

  it("declara EFECTIVO por el total y propaga cashSessionId al confirmar sin pagos", () => {
    const confirmSale = vi.fn();
    renderSheet(confirmSale);

    fireEvent.click(screen.getByText("Vender directo"));

    expect(confirmSale).toHaveBeenCalledWith(
      [{ method: "EFECTIVO", amount: 200 }],
      "cs-1",
      0,
    );
  });

  it("agrega pago en el método seleccionado y propaga payments + cashSessionId", () => {
    const confirmSale = vi.fn();
    renderSheet(confirmSale);

    // "Agregar pago" declara el saldo restante (el total) en el método actual.
    // Cambiando el método a TARJETA_CREDITO el pago se declara ahí.
    fireEvent.change(screen.getByLabelText("Efectivo recibido"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByLabelText("Método"), {
      target: { value: "TARJETA_CREDITO" },
    });
    fireEvent.click(screen.getByText("Agregar pago (Tarjeta de crédito)"));

    // Sin vuelto porque recibido (200) == total (200).
    expect(screen.queryByText("Vuelto")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Vender directo"));

    expect(confirmSale).toHaveBeenCalledWith(
      [{ method: "TARJETA_CREDITO", amount: 200 }],
      "cs-1",
      0,
    );
  });

  it("aplica descuento % al total (subtotal − descuento) y lo propaga a confirmSale", () => {
    const confirmSale = vi.fn();
    renderSheet(confirmSale);

    // Total = 200 (subtotal), 10% → descuento 20 → total 180.
    fireEvent.change(screen.getByLabelText("Descuento (%)"), {
      target: { value: "10" },
    });

    // El total mostrado pasa de 200 a 180.
    expect(screen.getByText("Descuento")).toBeInTheDocument();
    expect(screen.getByText("−$20,00")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Vender directo"));

    // El EFECTIVO default usa el total DESCONTADO (180) y se propaga el 10%.
    expect(confirmSale).toHaveBeenCalledWith(
      [{ method: "EFECTIVO", amount: 180 }],
      "cs-1",
      10,
    );
  });
});
