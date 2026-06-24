-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "address" TEXT,
ADD COLUMN     "badges" JSONB,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT;
