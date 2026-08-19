import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterChips } from "@/components/molecules/FilterChips";
import type { DataItem } from "@/types";

function product(name: string, variantValue: string): DataItem {
  return {
    _id: name,
    name,
    code: `C-${variantValue}`,
    price: 100,
    quantity: 1,
    variantAssignments: [
      {
        option: { value: variantValue, variant: { name: "Marca" } },
      },
    ],
  } as unknown as DataItem;
}

const products = [
  product("Purina Pro Plan", "Purina"),
  product("Proplan Adultos", "Proplan"),
  product("Kongo Snacks", "Kongo"),
];

function renderChips(filter = "", categoryFilter = "") {
  const onFilterChange = vi.fn();
  const onCategoryChange = vi.fn();
  const onClear = vi.fn();
  render(
    <FilterChips
      products={products}
      filter={filter}
      categoryFilter={categoryFilter}
      onFilterChange={onFilterChange}
      onCategoryChange={onCategoryChange}
      onClear={onClear}
    />,
  );
  return { onFilterChange, onCategoryChange, onClear };
}

// Pill de variante: tiene cursor-pointer (los badges de la barra de filtros
// activos NO lo tienen).
function clickPill(text: string) {
  const el = screen
    .getAllByText(text)
    .find((n) => n.className.includes("cursor-pointer"));
  if (!el) throw new Error(`pill ${text} not found`);
  fireEvent.click(el);
}

describe("FilterChips — multi-marca desde las pills", () => {
  it("muestra las marcas como pills sin necesidad de categoría", () => {
    renderChips();

    expect(screen.getByText("Purina")).toBeInTheDocument();
    expect(screen.getByText("Proplan")).toBeInTheDocument();
    expect(screen.getByText("Kongo")).toBeInTheDocument();
  });

  it("click en una marca agrega el término al filtro", () => {
    const { onFilterChange } = renderChips();

    clickPill("Purina");

    expect(onFilterChange).toHaveBeenCalledWith("Purina");
  });

  it("click en una segunda marca la agrega separada por coma (OR)", () => {
    const { onFilterChange } = renderChips("Purina");

    clickPill("Proplan");

    expect(onFilterChange).toHaveBeenCalledWith("Purina, Proplan");
  });

  it("click en una marca activa la quita del filtro", () => {
    const { onFilterChange } = renderChips("Purina, Proplan");

    clickPill("Purina");

    expect(onFilterChange).toHaveBeenCalledWith("Proplan");
  });

  it("marca con el término completo queda resaltada (no substring)", () => {
    // "Pro" está dentro de "Proplan" pero NO es un término propio.
    renderChips("Pro");

    const pill = screen
      .getAllByText("Proplan")
      .find((n) => n.className.includes("cursor-pointer"));
    // Activa (variant secondary) lleva bg-secondary; inactiva (outline) no.
    expect(pill?.className).not.toContain("bg-secondary");
  });

  it("muestra los términos activos como badges en la barra de filtros", () => {
    renderChips("Purina, Proplan");

    expect(screen.getByText("Filtros:")).toBeInTheDocument();
    // La pill de variante Y el badge de la barra muestran el término activo.
    expect(screen.getAllByText("Purina").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Proplan").length).toBeGreaterThanOrEqual(2);
  });

  it("quitar un badge activo de la barra usa toggleTerm (no rompe los otros)", () => {
    const { onFilterChange } = renderChips("Purina, Proplan");
    const xButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("rounded-full"));
    expect(xButtons.length).toBe(2);
    fireEvent.click(xButtons[0]);

    expect(onFilterChange).toHaveBeenCalledWith("Proplan");
  });
});

describe("FilterChips — chips de títulos de planilla", () => {
  const titles = [
    { key: "SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY", label: "SIEGER PUPPY", count: 3 },
    { key: "MAXXIUM|MAXXIUM PERROS", label: "MAXXIUM PERROS", count: 2 },
  ];

  function renderTitleChips(titleFilter: string | null = null) {
    const onFilterChange = vi.fn();
    const onCategoryChange = vi.fn();
    const onClear = vi.fn();
    const onTitleChange = vi.fn();
    render(
      <FilterChips
        products={products}
        filter=""
        categoryFilter=""
        onFilterChange={onFilterChange}
        onCategoryChange={onCategoryChange}
        onClear={onClear}
        titles={titles}
        titleFilter={titleFilter}
        onTitleChange={onTitleChange}
      />,
    );
    return { onFilterChange, onCategoryChange, onClear, onTitleChange };
  }

  function clickPill(text: string) {
    const el = screen
      .getAllByText(text)
      .find((n) => n.className.includes("cursor-pointer"));
    if (!el) throw new Error(`pill ${text} not found`);
    fireEvent.click(el);
  }

  it("muestra el grupo con el header 'Títulos' y chips con label y conteo", () => {
    renderTitleChips();

    expect(screen.getByText("Títulos")).toBeInTheDocument();
    expect(screen.getByText("SIEGER PUPPY (3)")).toBeInTheDocument();
    expect(screen.getByText("MAXXIUM PERROS (2)")).toBeInTheDocument();
  });

  it("seleccionar un título activa onTitleChange con la key", () => {
    const { onTitleChange } = renderTitleChips();

    clickPill("SIEGER PUPPY (3)");

    expect(onTitleChange).toHaveBeenCalledWith("SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY");
  });

  it("un título activo se deselecciona al clickearlo (onTitleChange(null))", () => {
    const { onTitleChange } = renderTitleChips("SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY");

    clickPill("SIEGER PUPPY (3)");

    expect(onTitleChange).toHaveBeenCalledWith(null);
  });

  it("el título activo aparece como badge en la barra de filtros (label sin conteo)", () => {
    const { onTitleChange } = renderTitleChips("MAXXIUM|MAXXIUM PERROS");

    expect(screen.getByText("Filtros:")).toBeInTheDocument();
    // El chip muestra label + conteo; el badge de la barra solo el label.
    expect(screen.getByText("MAXXIUM PERROS (2)")).toBeInTheDocument();
    expect(screen.getByText("MAXXIUM PERROS")).toBeInTheDocument();

    // El botón X del badge deselecciona (null).
    const xButton = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg"));
    fireEvent.click(xButton!);
    expect(onTitleChange).toHaveBeenCalledWith(null);
  });

  it("sin la prop titles no renderiza el grupo (cero impacto en otras vistas)", () => {
    render(
      <FilterChips
        products={products}
        filter=""
        categoryFilter=""
        onFilterChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByText("SIEGER PUPPY")).not.toBeInTheDocument();
    expect(screen.queryByText("Títulos")).not.toBeInTheDocument();
  });
});
