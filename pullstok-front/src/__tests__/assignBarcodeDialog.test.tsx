import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AssignBarcodeDialog } from "@/components/molecules/AssignBarcodeDialog";
import { toast } from "react-toastify";
import { addProductBarcode } from "@/services/productService";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/productService", () => ({
  addProductBarcode: vi.fn(),
}));

const hits = [
  {
    id: "p1",
    name: "Royal Canin Mini Adult 3kg",
    code: "RC-001",
    category: { name: "Alimento" },
  },
  {
    id: "p2",
    name: "Royal Canin Maxi 15kg",
    code: "RC-002",
    variantAssignments: [{ option: { value: "15kg", variant: { name: "Peso" } } }],
  },
];

const jsonResponse = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) });

describe("AssignBarcodeDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("token", "tkn");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const searchFor = async (text: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Buscá el producto por nombre/), {
      target: { value: text },
    });
    return screen.findByText(hits[0].name);
  };

  it("does not render anything when closed", () => {
    render(<AssignBarcodeDialog barcode="7790001" open={false} onClose={vi.fn()} />);
    expect(screen.queryByText("Vincular código")).not.toBeInTheDocument();
  });

  it("shows the scanned barcode and does not search under 2 chars", async () => {
    render(<AssignBarcodeDialog barcode="7790001" open onClose={vi.fn()} />);
    expect(screen.getByText("7790001")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Buscá el producto por nombre/), {
      target: { value: "r" },
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches by name, assigns the barcode on click and reports success", async () => {
    const onClose = vi.fn();
    const onAssigned = vi.fn();
    const assigned = { id: "p1", name: hits[0].name, barcode: "7790001" };
    fetchMock
      .mockImplementationOnce(() => jsonResponse(hits))
      .mockImplementationOnce(() => jsonResponse(assigned));

    render(
      <AssignBarcodeDialog barcode="7790001" open onClose={onClose} onAssigned={onAssigned} />,
    );
    fireEvent.click(await searchFor("royal"));

    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(assigned));
    const [searchUrl, searchInit] = fetchMock.mock.calls[0];
    expect(searchUrl).toContain("/products?name=royal");
    expect(searchInit.headers.Authorization).toBe("Bearer tkn");
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toContain("/products/p1");
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(putInit.body)).toEqual({ barcode: "7790001" });
    expect(toast.success).toHaveBeenCalledWith("¡Código asignado!");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server message and stays open when the assignment fails", async () => {
    const onClose = vi.fn();
    const onAssigned = vi.fn();
    fetchMock
      .mockImplementationOnce(() => jsonResponse(hits))
      .mockImplementationOnce(() => jsonResponse({ message: "Código ya en uso" }, false));

    render(
      <AssignBarcodeDialog barcode="7790001" open onClose={onClose} onAssigned={onAssigned} />,
    );
    fireEvent.click(await searchFor("royal"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Código ya en uso"));
    expect(onAssigned).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to the default error message", async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse(hits))
      .mockImplementationOnce(() => jsonResponse({}, false));
    render(<AssignBarcodeDialog barcode="7790001" open onClose={vi.fn()} />);
    fireEvent.click(await searchFor("royal"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al asignar código"));
  });

  it("renders category and variant badges for results", async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse(hits));
    render(<AssignBarcodeDialog barcode="7790001" open onClose={vi.fn()} />);
    await searchFor("royal");
    expect(screen.getByText("Alimento")).toBeInTheDocument();
    expect(screen.getByText("Peso: 15kg")).toBeInTheDocument();
  });

  it("picks the highlighted result with ArrowDown + Enter", async () => {
    const onAssigned = vi.fn();
    const assigned = { id: "p2", name: hits[1].name };
    fetchMock
      .mockImplementationOnce(() => jsonResponse(hits))
      .mockImplementationOnce(() => jsonResponse(assigned));
    render(<AssignBarcodeDialog barcode="7790001" open onClose={vi.fn()} onAssigned={onAssigned} />);
    await searchFor("royal");
    const input = screen.getByPlaceholderText(/Buscá el producto por nombre/);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(assigned));
    expect(fetchMock.mock.calls[1][0]).toContain("/products/p2");
  });

  describe("when the chosen product already has a barcode", () => {
    const withBarcode = [{ ...hits[0], barcode: "OLD-111" }];

    const pickProduct = async () => {
      fetchMock.mockImplementationOnce(() => jsonResponse(withBarcode));
      fireEvent.change(screen.getByPlaceholderText(/Buscá el producto por nombre/), {
        target: { value: "royal" },
      });
      fireEvent.click(await screen.findByText(hits[0].name));
    };

    it("asks add-vs-replace instead of assigning right away", async () => {
      render(<AssignBarcodeDialog barcode="7790001" open onClose={vi.fn()} />);
      await pickProduct();
      expect(await screen.findByText("Agregar como código adicional")).toBeInTheDocument();
      expect(screen.getByText("Reemplazar código")).toBeInTheDocument();
      expect(screen.getByText("OLD-111")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1); // only the search, no PUT yet
    });

    it("adds the code as an additional barcode", async () => {
      const onClose = vi.fn();
      const onAssigned = vi.fn();
      vi.mocked(addProductBarcode).mockResolvedValue({ id: "b1", code: "7790001" });
      render(
        <AssignBarcodeDialog barcode="7790001" open onClose={onClose} onAssigned={onAssigned} />,
      );
      await pickProduct();
      fireEvent.click(await screen.findByText("Agregar como código adicional"));
      await waitFor(() => expect(addProductBarcode).toHaveBeenCalledWith("p1", "7790001"));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(onAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p1", barcodes: [{ id: "b1", code: "7790001" }] }),
      );
      expect(toast.success).toHaveBeenCalledWith("Código adicional agregado");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("surfaces the 409 message and stays open", async () => {
      const onClose = vi.fn();
      vi.mocked(addProductBarcode).mockRejectedValue(new Error("El código ya está en uso"));
      render(<AssignBarcodeDialog barcode="7790001" open onClose={onClose} />);
      await pickProduct();
      fireEvent.click(await screen.findByText("Agregar como código adicional"));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("El código ya está en uso"),
      );
      expect(onClose).not.toHaveBeenCalled();
    });

    it("replaces the primary code with the existing PUT behavior", async () => {
      const onAssigned = vi.fn();
      const assigned = { id: "p1", name: hits[0].name, barcode: "7790001" };
      render(<AssignBarcodeDialog barcode="7790001" open onClose={vi.fn()} onAssigned={onAssigned} />);
      await pickProduct();
      fetchMock.mockImplementationOnce(() => jsonResponse(assigned));
      fireEvent.click(await screen.findByText("Reemplazar código"));
      await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(assigned));
      const [putUrl, putInit] = fetchMock.mock.calls[1];
      expect(putUrl).toContain("/products/p1");
      expect(putInit.method).toBe("PUT");
      expect(addProductBarcode).not.toHaveBeenCalled();
    });
  });
});
