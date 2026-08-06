import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OutsideBusinessHours } from "@/views/OutsideBusinessHours";

/**
 * Block screen copy (REQ-5): title and message must match exactly so the
 * operative user understands WHY they were locked out.
 */
describe("OutsideBusinessHours — copy", () => {
  it("muestra el título exacto del spec", () => {
    render(<OutsideBusinessHours />);
    expect(
      screen.getByText("Fuera del horario comercial"),
    ).toBeInTheDocument();
  });

  it("muestra el mensaje exacto del spec (acceso solo dentro del horario)", () => {
    render(<OutsideBusinessHours />);
    expect(
      screen.getByText(/El acceso al sistema está disponible solo dentro del horario del comercio/),
    ).toBeInTheDocument();
  });
});
