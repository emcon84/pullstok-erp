import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

vi.mock("../services/productService", () => ({
  createManualProduct: vi.fn(),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ManualProductDialog } from "../components/molecules/ManualProductDialog";
import { parseManualPrice } from "../components/hooks/vendorRowHelpers";
import { createManualProduct } from "../services/productService";
import { toast } from "react-toastify";

const createMock = vi.mocked(createManualProduct);

const created = {
  id: "p-manual",
  name: "TORNILLO 5MM",
  price: "1500",
  quantity: 0,
  isManual: true,
};

function Host({
  onCreated,
  onClosed,
}: {
  onCreated: (p: unknown, qty: number) => void;
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <ManualProductDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreated as never}
        onClosed={onClosed}
      />
    </QueryClientProvider>
  );
}

const fill = (name: string, price: string, qty?: string) => {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Precio"), { target: { value: price } });
  if (qty !== undefined) {
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: qty } });
  }
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));

describe("parseManualPrice", () => {
  it("interpreta formatos es-AR", () => {
    expect(parseManualPrice("1500")).toBe(1500);
    expect(parseManualPrice("1500,5")).toBe(1500.5);
    expect(parseManualPrice("1.500")).toBe(1500);
    expect(parseManualPrice("1.500,50")).toBe(1500.5);
    expect(parseManualPrice("12.5")).toBe(12.5);
  });

  it("devuelve NaN para vacío o texto", () => {
    expect(parseManualPrice("")).toBeNaN();
    expect(parseManualPrice("abc")).toBeNaN();
  });
});

describe("ManualProductDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("muestra Nombre, Precio y Cantidad (default 1)", () => {
    render(<Host onCreated={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: /producto manual/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio")).toBeInTheDocument();
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("1");
  });

  it("no envía con nombre vacío y muestra el error", () => {
    const onCreated = vi.fn();
    render(<Host onCreated={onCreated} />);
    fill("   ", "1500");
    submit();
    expect(createMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/nombre/i);
  });

  it.each(["", "0", "0,00", "abc"])("no envía con precio inválido (%s)", (price) => {
    const onCreated = vi.fn();
    render(<Host onCreated={onCreated} />);
    fill("Tornillo", price);
    submit();
    expect(createMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/precio/i);
  });

  it("no envía con cantidad 0 o vacía", () => {
    render(<Host onCreated={vi.fn()} />);
    fill("Tornillo", "1500", "0");
    submit();
    expect(createMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/cantidad/i);
  });

  it("al éxito llama al servicio, avisa con el producto y la cantidad, y se cierra", async () => {
    createMock.mockResolvedValue(created as never);
    const onCreated = vi.fn();
    const onClosed = vi.fn();
    render(<Host onCreated={onCreated} onClosed={onClosed} />);
    fill("  Tornillo 5mm ", "1.500", "3");
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, 3));
    expect(createMock).toHaveBeenCalledWith({ name: "Tornillo 5mm", price: 1500 });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
  });

  it("Enter en el formulario también envía", async () => {
    createMock.mockResolvedValue(created as never);
    const onCreated = vi.fn();
    render(<Host onCreated={onCreated} />);
    fill("Tornillo", "1500");
    fireEvent.submit(screen.getByLabelText("Nombre").closest("form")!);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, 1));
  });

  it("ante error de la API muestra toast, no avisa y queda abierto", async () => {
    createMock.mockRejectedValue(new Error("Datos inválidos"));
    const onCreated = vi.fn();
    render(<Host onCreated={onCreated} />);
    fill("Tornillo", "1500");
    submit();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Datos inválidos"));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("evita el doble envío: el botón se deshabilita mientras la petición está pendiente", async () => {
    let resolve: (v: unknown) => void = () => {};
    createMock.mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<Host onCreated={vi.fn()} />);
    fill("Tornillo", "1500");
    submit();

    const btn = await screen.findByRole("button", { name: /agregando|guardando/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    fireEvent.submit(screen.getByLabelText("Nombre").closest("form")!);
    expect(createMock).toHaveBeenCalledTimes(1);

    resolve(created);
  });

  it("Cancelar cierra sin llamar a la API", () => {
    render(<Host onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("reinicia los campos al reabrirse", async () => {
    function Reopen() {
      const [open, setOpen] = useState(true);
      const [client] = useState(() => new QueryClient());
      return (
        <QueryClientProvider client={client}>
          <button onClick={() => setOpen(true)}>abrir</button>
          <ManualProductDialog open={open} onOpenChange={setOpen} onCreated={vi.fn()} />
        </QueryClientProvider>
      );
    }
    render(<Reopen />);
    fill("Tornillo", "1500", "4");
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Precio") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("1");
  });
});
