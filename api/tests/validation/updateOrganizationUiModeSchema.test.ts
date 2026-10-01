/**
 * Zod schema tests para updateOrganizationUiModeSchema (modo de interfaz por
 * organización, editable solo por SUPERADMIN). Sin DB.
 */
import { updateOrganizationUiModeSchema } from "../../src/validation/schemas";

describe("updateOrganizationUiModeSchema", () => {
  it.each(["OPERATIVO", "ADMINISTRATIVO"])("acepta %s", (uiMode) => {
    const result = updateOrganizationUiModeSchema.safeParse({ uiMode });
    expect(result.success).toBe(true);
    expect(result.data?.uiMode).toBe(uiMode);
  });

  it("rechaza un valor desconocido", () => {
    expect(
      updateOrganizationUiModeSchema.safeParse({ uiMode: "CONTABLE" }).success,
    ).toBe(false);
  });

  it("rechaza minúsculas y body vacío", () => {
    expect(
      updateOrganizationUiModeSchema.safeParse({ uiMode: "operativo" }).success,
    ).toBe(false);
    expect(updateOrganizationUiModeSchema.safeParse({}).success).toBe(false);
  });
});
