import { prisma } from "../config/db";

/**
 * Devuelve el siguiente número de secuencia para un comprobante,
 * SCOPEADO por organización (cada negocio tiene su propia numeración).
 */
const getNextSequenceValue = async (
  organizationId: string,
  sequenceName: string,
): Promise<number> => {
  const counter = await prisma.counter.upsert({
    where: { organizationId_name: { organizationId, name: sequenceName } },
    update: { sequenceValue: { increment: 1 } },
    create: { organizationId, name: sequenceName, sequenceValue: 1 },
  });
  return counter.sequenceValue;
};

export default getNextSequenceValue;
