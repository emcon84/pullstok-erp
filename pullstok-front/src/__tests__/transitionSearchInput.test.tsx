import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransitionSearchInput } from "@/components/molecules/TransitionSearchInput";

const PLACEHOLDER = "Buscar...";

describe("TransitionSearchInput — el input no depende del padre para pintar", () => {
  it("arranca con initialValue", () => {
    render(
      <TransitionSearchInput
        initialValue="royal"
        placeholder={PLACEHOLDER}
        onValueChange={vi.fn()}
      />,
    );
    expect((screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement).value).toBe(
      "royal",
    );
  });

  it("muestra lo tipeado aunque el padre nunca vuelva a pasarle el valor", () => {
    const onValueChange = vi.fn();
    render(
      <TransitionSearchInput
        initialValue=""
        placeholder={PLACEHOLDER}
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "r" } });
    fireEvent.change(input, { target: { value: "ro" } });

    expect(input.value).toBe("ro");
  });

  it("le avisa al padre cada valor nuevo", () => {
    const onValueChange = vi.fn();
    render(
      <TransitionSearchInput
        initialValue=""
        placeholder={PLACEHOLDER}
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    fireEvent.change(input, { target: { value: "r" } });
    fireEvent.change(input, { target: { value: "ro" } });

    expect(onValueChange).toHaveBeenNthCalledWith(1, "r");
    expect(onValueChange).toHaveBeenNthCalledWith(2, "ro");
  });
});
