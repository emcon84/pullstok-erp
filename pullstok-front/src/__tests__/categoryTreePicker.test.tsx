import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CategoryTreePicker } from "@/components/molecules/CategoryTreePicker";
import { filterTree, type TreeNode } from "@/components/molecules/CategoryTreePicker/tree";
import * as onboardingService from "@/services/onboardingService";

// Árbol de prueba: 2 raíces, una con hijos (para probar poda + auto-expand).
const CATS = [
  { id: "r1", name: "ALIMENTACIÓN Y NUTRICIÓN", parentId: null },
  { id: "c1", name: "PERROS", parentId: "r1" },
  { id: "c2", name: "GATOS", parentId: "r1" },
  { id: "r2", name: "BEBEDEROS", parentId: null },
];

describe("filterTree — pure filter/poda del árbol", () => {
  const node = (over: Partial<TreeNode>): TreeNode => ({
    id: "id",
    name: "name",
    parentId: null,
    organizationId: "org-1",
    children: [],
    ...over,
  });

  const tree: TreeNode[] = [
    node({
      id: "r1",
      name: "ALIMENTACIÓN Y NUTRICIÓN",
      children: [
        node({ id: "c1", name: "PERROS", parentId: "r1" }),
        node({ id: "c2", name: "GATOS", parentId: "r1" }),
      ],
    }),
    node({ id: "r2", name: "BEBEDEROS" }),
  ];

  it("query vacío devuelve el árbol tal cual", () => {
    expect(filterTree(tree, "")).toEqual(tree);
    expect(filterTree(tree, "   ")).toEqual(tree);
  });

  it("un hijo que matchea conserva su padre (aunque el padre no matchee)", () => {
    const result = filterTree(tree, "perros");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
    expect(result[0].children.map((c) => c.id)).toEqual(["c1"]);
  });

  it("una raíz que matchea se conserva completa, con todos sus hijos", () => {
    const result = filterTree(tree, "alimentación");
    expect(result[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("case-insensitive y por substring", () => {
    expect(filterTree(tree, "bebed")[0].id).toBe("r2");
    expect(filterTree(tree, "BeBeDeRoS")[0].id).toBe("r2");
  });

  it("sin coincidencias devuelve árbol vacío", () => {
    expect(filterTree(tree, "xyz-no-existe")).toEqual([]);
  });
});

describe("CategoryTreePicker — buscador", () => {
  beforeEach(() => {
    vi.spyOn(onboardingService, "getCategories").mockResolvedValue(CATS as never);
  });

  it("filtra las filas visibles al tipear y expande el padre del match", async () => {
    render(<CategoryTreePicker value={null} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("BEBEDEROS")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Buscar categoría…"), {
      target: { value: "perros" },
    });

    expect(screen.getByText("PERROS")).toBeInTheDocument();
    expect(screen.queryByText("GATOS")).not.toBeInTheDocument();
    expect(screen.queryByText("BEBEDEROS")).not.toBeInTheDocument();
  });

  it("limpiando el buscador vuelve a mostrar el árbol completo colapsado", async () => {
    render(<CategoryTreePicker value={null} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("BEBEDEROS")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("Buscar categoría…");
    fireEvent.change(input, { target: { value: "perros" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(screen.getByText("BEBEDEROS")).toBeInTheDocument();
    expect(screen.queryByText("PERROS")).not.toBeInTheDocument();
  });

  it("sin coincidencias muestra un mensaje en vez de una lista vacía muda", async () => {
    render(<CategoryTreePicker value={null} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("BEBEDEROS")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Buscar categoría…"), {
      target: { value: "no-existe-esto" },
    });

    expect(screen.getByText(/sin resultados/i)).toBeInTheDocument();
  });
});
