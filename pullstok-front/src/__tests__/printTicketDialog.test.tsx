import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintTicketDialog } from "@/components/molecules/PrintTicketDialog";

// Diálogo "¿Imprimir ticket?" (presentacional). Teclado: S/Enter = sí,
// N/Esc = no; el foco arranca en "Sí, imprimir".

function setup(open = true) {
  const onPrint = vi.fn();
  const onSkip = vi.fn();
  const utils = render(<PrintTicketDialog open={open} onPrint={onPrint} onSkip={onSkip} />);
  return { onPrint, onSkip, ...utils };
}

describe("PrintTicketDialog", () => {
  it("abierto: muestra el título y los botones Sí / No", () => {
    setup();
    expect(screen.getByText("¿Imprimir ticket?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sí, imprimir/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
  });

  it("cerrado: no renderiza nada", () => {
    setup(false);
    expect(screen.queryByText("¿Imprimir ticket?")).not.toBeInTheDocument();
  });

  it("enfoca el botón 'Sí, imprimir' al abrir", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sí, imprimir/i })).toHaveFocus(),
    );
  });

  it("clic en 'Sí, imprimir' llama onPrint (y no onSkip)", () => {
    const { onPrint, onSkip } = setup();
    fireEvent.click(screen.getByRole("button", { name: /sí, imprimir/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("clic en 'No' llama onSkip (y no onPrint)", () => {
    const { onPrint, onSkip } = setup();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onPrint).not.toHaveBeenCalled();
  });

  it.each(["s", "S", "Enter"])("tecla %s llama onPrint una sola vez", async (key) => {
    const { onPrint, onSkip } = setup();
    const yes = screen.getByRole("button", { name: /sí, imprimir/i });
    await waitFor(() => expect(yes).toHaveFocus());
    fireEvent.keyDown(yes, { key });
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it.each(["n", "N", "Escape"])("tecla %s llama onSkip una sola vez", async (key) => {
    const { onPrint, onSkip } = setup();
    const yes = screen.getByRole("button", { name: /sí, imprimir/i });
    await waitFor(() => expect(yes).toHaveFocus());
    fireEvent.keyDown(yes, { key });
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onPrint).not.toHaveBeenCalled();
  });

  it("Enter con el foco en 'No' no imprime (lo resuelve el clic nativo del botón)", () => {
    const { onPrint } = setup();
    const no = screen.getByRole("button", { name: "No" });
    no.focus();
    fireEvent.keyDown(no, { key: "Enter" });
    expect(onPrint).not.toHaveBeenCalled();
  });

  it("ignora otras teclas", async () => {
    const { onPrint, onSkip } = setup();
    const yes = screen.getByRole("button", { name: /sí, imprimir/i });
    await waitFor(() => expect(yes).toHaveFocus());
    fireEvent.keyDown(yes, { key: "x" });
    fireEvent.keyDown(yes, { key: "v" });
    expect(onPrint).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("al cerrarse llama onClosed (para devolver el foco al POS)", async () => {
    const onClosed = vi.fn();
    const { rerender } = render(
      <PrintTicketDialog open onPrint={vi.fn()} onSkip={vi.fn()} onClosed={onClosed} />,
    );
    rerender(
      <PrintTicketDialog open={false} onPrint={vi.fn()} onSkip={vi.fn()} onClosed={onClosed} />,
    );
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });
});
