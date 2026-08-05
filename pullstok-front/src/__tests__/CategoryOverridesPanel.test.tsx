import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryOverridesPanel } from "@/components/molecules/CategoryOverridesPanel";

const nodes = [
  { id: "alimentos", name: "Alimentos" },
  { id: "bebidas", name: "Bebidas" },
];

describe("CategoryOverridesPanel — controlled side panel of selected categories", () => {
  it("renders each selected category name with its own % input", () => {
    render(
      <CategoryOverridesPanel nodes={nodes} values={{}} onChange={() => {}} />,
    );

    expect(screen.getByText("Categorías seleccionadas")).toBeInTheDocument();
    expect(screen.getByText("Alimentos")).toBeInTheDocument();
    expect(screen.getByText("Bebidas")).toBeInTheDocument();
    expect(screen.getByLabelText(/alimentos/i)).toHaveAttribute("type", "number");
    expect(screen.getByLabelText(/bebidas/i)).toHaveAttribute("type", "number");
  });

  it("calls onChange with the edited value for the matching id", () => {
    const onChange = vi.fn();
    render(
      <CategoryOverridesPanel
        nodes={[nodes[0]]}
        values={{}}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(/alimentos/i), {
      target: { value: "10" },
    });

    expect(onChange).toHaveBeenCalledWith("alimentos", "10");
  });

  it("shows the initial value coming from the values map prefilled", () => {
    render(
      <CategoryOverridesPanel
        nodes={nodes}
        values={{ alimentos: "8" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/alimentos/i)).toHaveValue(8);
  });

  it("renders an empty state when there are no selected nodes", () => {
    render(<CategoryOverridesPanel nodes={[]} values={{}} onChange={() => {}} />);
    expect(screen.getByText(/no hay categorías seleccionadas/i)).toBeInTheDocument();
  });
});