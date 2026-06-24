-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('STORE', 'INTERNAL');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "publishedToStore" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#111827',
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "tagline" TEXT,
    "showNewsletter" BOOLEAN NOT NULL DEFAULT true,
    "showBanner" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_organizationId_key" ON "store_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
