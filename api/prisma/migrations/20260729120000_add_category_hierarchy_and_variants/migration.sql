-- AlterTable: add self-referential parentId to categories
ALTER TABLE "categories" ADD COLUMN "parentId" TEXT;

-- CreateTable: category_variant_definitions
CREATE TABLE "category_variant_definitions" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "category_variant_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: category_variant_options
CREATE TABLE "category_variant_options" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "category_variant_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable: product_variants
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraints for new tables
CREATE UNIQUE INDEX "category_variant_definitions_categoryId_name_key" ON "category_variant_definitions"("categoryId", "name");
CREATE UNIQUE INDEX "category_variant_options_variantId_value_key" ON "category_variant_options"("variantId", "value");
CREATE UNIQUE INDEX "product_variants_productId_optionId_key" ON "product_variants"("productId", "optionId");

-- AddForeignKey: categories.parentId → categories.id
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: category_variant_definitions
ALTER TABLE "category_variant_definitions" ADD CONSTRAINT "category_variant_definitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_variant_definitions" ADD CONSTRAINT "category_variant_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: category_variant_options
ALTER TABLE "category_variant_options" ADD CONSTRAINT "category_variant_options_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "category_variant_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_variant_options" ADD CONSTRAINT "category_variant_options_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: product_variants
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "category_variant_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
