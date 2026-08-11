import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mocks — the modal consumes updateProduct (service) and the query
// client; we stub the service so tests focus on the quick-price contract.
// ---------------------------------------------------------------------------
vi.mock("@/services/productService", () => ({
  updateProduct: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { QuickPriceModal } from "@/components/molecules/QuickPriceModal";
import { updateProduct } from "@/services/productService";
import { toast } from "react-toastify";

const updateProductMock = vi.mocked(updateProduct);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

const product = {
  _id: "p1",
  name: "Collar de Cuero",
  price: 1500,
  priceKgSuelto: 1500,
  quantity: 5,
};

function renderModal(props: React.ComponentProps<typeof QuickPriceModal>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickPriceModal {...props} />
    </QueryClientProvider>,
  );
}

describe("QuickPriceModal — edición rápida de precio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProductMock.mockResolvedValue({ message: "ok" });
  });

  it("muestra el nombre del producto, su precio actual y el precio por kg prefilled", () => {
    renderModal({ open: true, onClose: vi.fn(), product });

    expect(screen.getByText("Collar de Cuero")).toBeInTheDocument();
    const input = screen.getByLabelText("Precio") as HTMLInputElement;
    expect(input.value).toBe("1500");
    const kgInput = screen.getByLabelText("Precio por kg") as HTMLInputElement;
    expect(kgInput.value).toBe("1500");
  });

  it("prefill del precio por kg queda vacío cuando el producto no tiene priceKgSuelto", () => {
    renderModal({
      open: true,
      onClose: vi.fn(),
      product: { ...product, priceKgSuelto: 0 },
    });

    const kgInput = screen.getByLabelText("Precio por kg") as HTMLInputElement;
    expect(kgInput.value).toBe("");
  });

  it("envía _id, price y priceKgSuelto null cuando el campo kg queda vacío", async () => {
    const onClose = vi.fn();
    renderModal({ open: true, onClose, product });

    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "1800" },
    });
    fireEvent.change(screen.getByLabelText("Precio por kg"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateProductMock).toHaveBeenCalledTimes(1));
    const payload = updateProductMock.mock.calls[0][0];
    expect(payload._id).toBe("p1");
    expect(payload.price).toBe(1800);
    expect(payload.priceKgSuelto).toBeNull();
    expect(payload.name).toBeUndefined();
  });

  it("envía el precio por kg como número cuando se setea (manual gana)", async () => {
    const onClose = vi.fn();
    renderModal({ open: true, onClose, product });

    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "1800" },
    });
    fireEvent.change(screen.getByLabelText("Precio por kg"), {
      target: { value: "2600" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateProductMock).toHaveBeenCalledTimes(1));
    const payload = updateProductMock.mock.calls[0][0];
    expect(payload.priceKgSuelto).toBe(2600);
    expect(payload.price).toBe(1800);
  });

  it("rechaza un precio por kg inválido sin llamar a la API", () => {
    renderModal({ open: true, onClose: vi.fn(), product });

    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "1800" },
    });
    fireEvent.change(screen.getByLabelText("Precio por kg"), {
      target: { value: "-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateProductMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Ingresá un precio por kg válido");
  });

  it("guarda con Enter", async () => {
    renderModal({ open: true, onClose: vi.fn(), product });

    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "2000" },
    });
    fireEvent.keyDown(screen.getByLabelText("Precio"), { key: "Enter" });

    await waitFor(() => expect(updateProductMock).toHaveBeenCalledTimes(1));
    const payload = updateProductMock.mock.calls[0][0];
    expect(payload.price).toBe(2000);
  });

  it("cierra el modal tras guardar y avisa con toast", async () => {
    const onClose = vi.fn();
    renderModal({ open: true, onClose, product });

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccessMock).toHaveBeenCalledWith("Precio actualizado");
  });

  it("rechaza un precio inválido sin llamar a la API", () => {
    renderModal({ open: true, onClose: vi.fn(), product });

    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateProductMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("muestra el error del backend en un toast", async () => {
    updateProductMock.mockRejectedValue(new Error("update product failed"));
    renderModal({ open: true, onClose: vi.fn(), product });

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("update product failed"),
    );
  });
});
