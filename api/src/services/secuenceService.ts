import { prisma } from "../config/db";

// Cualquier cliente Prisma con el delegate `counter` sirve: tanto el cliente
// extendido (`prisma`) como el `tx` de un `$transaction`. Esto permite generar
// el número DENTRO de una transacción cuando se necesita (ej. checkout de
// tienda: así el número solo se consume si la Order realmente se crea).
type CounterClient = Pick<typeof prisma, "counter">;

/**
 * Devuelve el siguiente número de secuencia para un comprobante,
 * SCOPEADO por organización (cada negocio tiene su propia numeración).
 *
 * El incremento (`increment: 1`) es atómico a nivel DB, así que dos llamadas
 * concurrentes nunca devuelven el mismo valor. Pasá `client = tx` para que la
 * numeración participe de una transacción existente.
 */
const getNextSequenceValue = async (
  organizationId: string,
  sequenceName: string,
  client: CounterClient = prisma,
): Promise<number> => {
  const counter = await client.counter.upsert({
    where: { organizationId_name: { organizationId, name: sequenceName } },
    update: { sequenceValue: { increment: 1 } },
    create: { organizationId, name: sequenceName, sequenceValue: 1 },
  });
  return counter.sequenceValue;
};

export default getNextSequenceValue;
