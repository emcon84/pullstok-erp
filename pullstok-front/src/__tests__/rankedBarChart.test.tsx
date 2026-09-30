import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RankedBarChart } from "@/components/molecules/RankedBarChart";
import { truncateLabel } from "@/utils/truncateLabel";
import { formatCurrency } from "@/utils/statsHelpers";

const rows = [
  { label: "Alimento balanceado premium para perros adultos", amount: 15000.5, quantity: 12 },
  { label: "Snacks", amount: 2500, quantity: 3.5 },
];

describe("truncateLabel", () => {
  it("deja intactas las etiquetas cortas", () => {
    expect(truncateLabel("Snacks", 20)).toBe("Snacks");
  });
  it("trunca las largas con elipsis sin pasar el máximo", () => {
    const out = truncateLabel("Alimento balanceado premium para perros", 20);
    expect(out.length).toBe(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("RankedBarChart", () => {
  it("muestra el título y el estado vacío cuando no hay datos", () => {
    render(<RankedBarChart title="Ventas por categoría" data={[]} />);
    expect(screen.getByText("Ventas por categoría")).toBeInTheDocument();
    expect(screen.getByText("Sin ventas en el período")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver como tabla/i })).not.toBeInTheDocument();
  });

  it("ofrece una vista de tabla accesible con etiqueta completa, monto y cantidad", () => {
    render(<RankedBarChart title="Productos más vendidos" data={rows} />);
    const toggle = screen.getByRole("button", { name: /ver como tabla/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const table = screen.getByRole("table");
    const body = within(table).getAllByRole("row");
    // encabezado + 2 filas
    expect(body).toHaveLength(3);
    expect(within(body[1]).getByText(rows[0].label)).toBeInTheDocument();
    const norm = (s: string) => s.replace(/\s/g, " ");
    expect(
      within(body[1]).getByText((_, el) => el?.tagName === "TD" && norm(el.textContent ?? "") === norm(formatCurrency(15000.5))),
    ).toBeInTheDocument();
    expect(within(body[1]).getByText("12")).toBeInTheDocument();
    expect(within(body[2]).getByText("Snacks")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("el gráfico expone un resumen accesible", () => {
    render(<RankedBarChart title="Ventas por categoría" data={rows} />);
    expect(
      screen.getByRole("img", { name: /ventas por categoría/i }),
    ).toBeInTheDocument();
  });

  it("muestra la nota opcional", () => {
    render(<RankedBarChart title="T" data={rows} note="Montos antes de descuentos" />);
    expect(screen.getByText("Montos antes de descuentos")).toBeInTheDocument();
  });
});
