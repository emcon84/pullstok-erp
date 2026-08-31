import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductTable } from "@/components/molecules/ProductTable";
import type { DataItem } from "@/types";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";

// sdd/venta-por-unidad-multpack — el catálogo muestra "Caja" y "Por unidad"
// SOLO para productos elegibles (unitsPerBox > 1), con su precio por unidad.
// Los no elegibles quedan solo como "Caja".
const eligible: DataItem = {
  _id: "p-multipack",
  name: "FELIX POUCH PESC X 15x85grs",
  code: "F-15",
  price: 18400,
  quantity: 0,
  unitsPerBox: 15,
  perUnitPrice: 1226.67,
};

const plain: DataItem = {
  _id: "p-plain",
  name: "Bolsa simple",
  code: "S-1",
  price: 4500,
  quantity: 0,
};

function inlineQty(commit = vi.fn()) {
  return {
    value: () => "1",
    onChange: vi.fn(),
    onCommit: commit,
    registerInput: vi.fn(),
    disabled: () => false,
  };
}

function renderTable(items: DataItem[], extra?: Record<string, unknown>) {
  return render(
    <ProductTable
      items={items}
      cartItems={[] as VendorCartItem[]}
      selectedIndex={0}
      registerRow={vi.fn()}
      onRowClick={vi.fn()}
      onOpenDrawer={vi.fn()}
      onAssignBarcode={vi.fn()}
      inlineQty={inlineQty()}
      {...extra}
    />,
  );
}

describe("ProductTable — Caja / Por unidad según elegibilidad", () => {
  it("eligible product shows BOTH 'Caja' and 'Por unidad' actions", () => {
    renderTable([eligible]);
    expect(screen.getByText("Caja")).toBeInTheDocument();
    expect(screen.getByText("Por unidad")).toBeInTheDocument();
  });

  it("eligible product shows its per-unit price", () => {
    renderTable([eligible]);
    // 1226.67 en formato es-AR: "1.226,67"
    expect(screen.getByText(/Por unidad/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1\.226,67/).length).toBeGreaterThanOrEqual(1);
  });

  it("non-eligible product shows ONLY 'Caja' (no 'Por unidad')", () => {
    renderTable([plain]);
    expect(screen.getByText("Caja")).toBeInTheDocument();
    expect(screen.queryByText("Por unidad")).not.toBeInTheDocument();
  });

  it("clicking 'Por unidad' raises onRowModeChange('POR_UNIDAD')", () => {
    const onRowModeChange = vi.fn();
    renderTable([eligible], { onRowModeChange });
    const unitBtn = screen.getByText("Por unidad");
    unitBtn.click();
    expect(onRowModeChange).toHaveBeenCalledWith(eligible, "POR_UNIDAD");
  });

  it("clicking 'Caja' raises onRowModeChange('BOLSA_CERRADA')", () => {
    const onRowModeChange = vi.fn();
    renderTable([eligible], { onRowModeChange });
    const cajaBtn = screen.getByText("Caja");
    cajaBtn.click();
    expect(onRowModeChange).toHaveBeenCalledWith(eligible, "BOLSA_CERRADA");
  });
});
