-- CreateTable
CREATE TABLE "business_hour_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "days" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_hour_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_hour_settings_organizationId_key" ON "business_hour_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "business_hour_settings" ADD CONSTRAINT "business_hour_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
