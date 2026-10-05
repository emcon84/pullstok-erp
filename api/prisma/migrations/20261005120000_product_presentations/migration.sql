-- AlterTable
ALTER TABLE "products" ADD COLUMN "hasPresentations" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN "presentationId" TEXT,
ADD COLUMN "presentationName" TEXT,
ADD COLUMN "presentationFactor" INTEGER;

-- CreateTable
CREATE TABLE "product_presentations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "factor" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "wholesalePrice" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_presentations_factor_check" CHECK ("factor" >= 1)
);

-- CreateIndex
CREATE INDEX "product_presentations_organizationId_productId_idx" ON "product_presentations"("organizationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_productId_name_key" ON "product_presentations"("productId", "name");

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
