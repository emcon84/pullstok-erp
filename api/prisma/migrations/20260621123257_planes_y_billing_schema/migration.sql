-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('BASICO', 'PRO', 'PREMIUM');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "paidUntil" TIMESTAMP(3),
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'BASICO';
