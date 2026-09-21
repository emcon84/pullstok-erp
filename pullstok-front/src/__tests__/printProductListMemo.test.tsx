import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { DataItem } from "@/types";

vi.mock("@/lib/printGrouping", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/printGrouping")>();
  return { ...actual, groupByPlanTitle: vi.fn(actual.groupByPlanTitle) };
});

import { groupByPlanTitle } from "@/lib/printGrouping";
import { PrintProductList } from "@/components/molecules/PrintProductList";

const products: DataItem[] = Array.from({ length: 5 }, (_, i) => ({
  _id: `p-${i}`,
  name: `Producto ${i}`,
  code: `C${i}`,
  price: 100,
  quantity: 1,
}));

describe("PrintProductList — no recalcula si la lista no cambió", () => {
  beforeEach(() => {
    vi.mocked(groupByPlanTitle).mockClear();
  });

  it("re-render con la misma referencia de products no vuelve a agrupar", () => {
    const { rerender } = render(<PrintProductList products={products} />);
    expect(groupByPlanTitle).toHaveBeenCalledTimes(1);

    rerender(<PrintProductList products={products} />);

    expect(groupByPlanTitle).toHaveBeenCalledTimes(1);
  });

  it("si products cambia sí vuelve a agrupar", () => {
    const { rerender } = render(<PrintProductList products={products} />);

    rerender(<PrintProductList products={products.slice(0, 2)} />);

    expect(groupByPlanTitle).toHaveBeenCalledTimes(2);
  });
});
