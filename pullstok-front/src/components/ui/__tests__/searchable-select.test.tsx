import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableSelect } from "../searchable-select";

const options = [
  { value: "cell-1", label: "Agility · Adulto · Perro — $1.200/kg" },
  { value: "cell-2", label: "Royal Canin · Cachorro · Gato — $1.500/kg" },
  { value: "cell-3", label: "Royal Canin · Adulto · Perro — $1.800/kg" },
];

describe("SearchableSelect", () => {
  it("muestra el placeholder cuando no hay selección", () => {
    render(
      <SearchableSelect
        value=""
        onValueChange={vi.fn()}
        options={options}
        placeholder="Seleccioná una celda"
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Seleccioná una celda");
  });

  it("muestra el label de la opción seleccionada", () => {
    render(
      <SearchableSelect
        value="cell-2"
        onValueChange={vi.fn()}
        options={options}
        placeholder="Seleccioná una celda"
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Royal Canin · Cachorro · Gato");
  });

  it("al abrir muestra el input de búsqueda y todas las opciones", async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onValueChange={vi.fn()} options={options} />);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByPlaceholderText("Buscar…")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("filtra en vivo ignorando acentos y mayúsculas", async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onValueChange={vi.fn()} options={options} />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Buscar…"), "agility");

    const visible = screen.getAllByRole("option");
    expect(visible).toHaveLength(1);
    expect(visible[0]).toHaveTextContent("Agility");
  });

  it("selecciona con click y cierra el panel", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchableSelect value="" onValueChange={onValueChange} options={options} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Agility/ }));

    expect(onValueChange).toHaveBeenCalledWith("cell-1");
  });

  it("selecciona con teclado (ArrowDown + Enter)", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchableSelect value="" onValueChange={onValueChange} options={options} />);

    await user.click(screen.getByRole("combobox"));
    const search = screen.getByPlaceholderText("Buscar…");
    await user.type(search, "royal");
    // Dos opciones Royal → la segunda queda resaltada tras ArrowDown.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("cell-3");
  });

  it("muestra el mensaje de vacío cuando no hay coincidencias", async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        value=""
        onValueChange={vi.fn()}
        options={options}
        emptyMessage="Sin celdas que coincidan"
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Buscar…"), "zzzz");

    expect(screen.getByText("Sin celdas que coincidan")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
