import { prisma } from "../config/db";

// Function to get the next sequence number
const getNextSequenceValue = async (sequenceName: string): Promise<number> => {
  const sequenceDocument = await prisma.counter.upsert({
    where: { id: sequenceName },
    update: { sequenceValue: { increment: 1 } },
    create: { id: sequenceName, sequenceValue: 1 },
  });
  return sequenceDocument.sequenceValue;
};

export default getNextSequenceValue;
