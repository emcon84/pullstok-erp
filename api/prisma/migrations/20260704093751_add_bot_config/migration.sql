-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('BOT', 'HUMAN');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "mode" "ConversationMode" NOT NULL DEFAULT 'BOT';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bot_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "knowledgeBase" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'llama-3.1-8b-instant',
    "apiKey" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_configs_organizationId_key" ON "bot_configs"("organizationId");

-- AddForeignKey
ALTER TABLE "bot_configs" ADD CONSTRAINT "bot_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

