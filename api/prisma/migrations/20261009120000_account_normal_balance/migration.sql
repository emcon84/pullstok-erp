-- CreateEnum
CREATE TYPE "AccountNormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "normalBalance" "AccountNormalBalance";
