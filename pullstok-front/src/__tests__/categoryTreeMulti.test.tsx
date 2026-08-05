import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/services/onboardingService", () => ({
  getCategories: vi.fn(),
}));

import { CategoryTreePickerMulti } from "@/components/molecules/CategoryTreePickerMulti";
import { getCategories } from "@/services/onboardingService";

const mockGetCategories = vi.mocked(getCategories);

const categories = [
  { id: "a", name: "A", organizationId: "org-1", parentId: null },
  { id: "b", name: "B", organizationId: "org-1", parentId: "a" },
  { id: "c", name: "C", organizationId: "org-1", parentId: "b" },
  { id: "d", name: "D", organizationId: "org-1", parentId: null },
];

describe("CategoryTreePickerMulti — tri-state subtree selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCategories.mockResolvedValue(categories);
  });

  it("checking a parent adds the parent and every descendant to the selection", async () => {
    const onChange = vi.fn();
    render(<CategoryTreePickerMulti selected={[]} onChange={onChange} />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "A" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["a", "b", "c"]));
  });

  it("unchecking a fully-checked parent removes the whole subtree", async () => {
    const onChange = vi.fn();
    render(
      <CategoryTreePickerMulti selected={["a", "b", "c"]} onChange={onChange} />,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: "A" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });

  it("renders the parent as indeterminate when only part of the subtree is selected", async () => {
    render(<CategoryTreePickerMulti selected={["b"]} onChange={vi.fn()} />);

    const parent = await screen.findByRole("checkbox", { name: "A" });
    expect(parent).toHaveAttribute("aria-checked", "mixed");
  });

  it("renders a fully-selected parent as checked", async () => {
    render(
      <CategoryTreePickerMulti selected={["a", "b", "c"]} onChange={vi.fn()} />,
    );

    const parent = await screen.findByRole("checkbox", { name: "A" });
    expect(parent).toHaveAttribute("aria-checked", "true");
  });

  it("clicking an indeterminate parent checks the whole subtree", async () => {
    const onChange = vi.fn();
    render(<CategoryTreePickerMulti selected={["b"]} onChange={onChange} />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "A" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["a", "b", "c"]));
  });

  it("toggling a leaf only affects that leaf", async () => {
    const onChange = vi.fn();
    render(<CategoryTreePickerMulti selected={[]} onChange={onChange} />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "D" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["d"]));
  });

  it("expanding a parent reveals its direct children (per-node expansion)", async () => {
    render(<CategoryTreePickerMulti selected={[]} onChange={vi.fn()} />);

    expect(await screen.findByRole("checkbox", { name: "A" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "B" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expandir A/i }));

    expect(await screen.findByRole("checkbox", { name: "B" })).toBeInTheDocument();
    // Grandchild C stays hidden until its parent B is expanded too
    expect(screen.queryByRole("checkbox", { name: "C" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expandir B/i }));

    expect(await screen.findByRole("checkbox", { name: "C" })).toBeInTheDocument();
  });
});