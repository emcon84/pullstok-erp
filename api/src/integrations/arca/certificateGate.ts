import { basePrisma } from "../../config/db";
import type { ArcaEnvironment } from "./types";

/** ¿Existe un ArcaCertificate cargado para este (org, ambiente)? Reemplaza el
 * viejo chequeo `!!setting.certPath && !!setting.keyPath` (deprecated,
 * quedan null en una org que solo pasó por el flujo self-service) — un solo
 * lugar para esta pregunta, usado por el gate de emisión, el chequeo inline
 * de invoiceController y el endpoint público check-enabled, para que no
 * queden versiones desincronizadas del mismo predicado. */
export const hasArcaCertificate = async (
  organizationId: string,
  environment: ArcaEnvironment,
): Promise<boolean> => {
  const cert = await basePrisma.arcaCertificate.findUnique({
    where: { organizationId_environment: { organizationId, environment } },
    select: { id: true },
  });
  return cert !== null;
};
