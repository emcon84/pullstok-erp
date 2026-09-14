-- CreateEnum
CREATE TYPE "VendorChatStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "VendorMessageSender" AS ENUM ('SELLER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "vendor_chats" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "VendorChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_chat_messages" (
    "id" TEXT NOT NULL,
    "vendorChatId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sender" "VendorMessageSender" NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "ragContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_chats_organizationId_idx" ON "vendor_chats"("organizationId");

-- CreateIndex
CREATE INDEX "vendor_chats_organizationId_sellerId_idx" ON "vendor_chats"("organizationId", "sellerId");

-- CreateIndex
CREATE INDEX "vendor_chat_messages_vendorChatId_createdAt_idx" ON "vendor_chat_messages"("vendorChatId", "createdAt");

-- CreateIndex
CREATE INDEX "vendor_chat_messages_organizationId_idx" ON "vendor_chat_messages"("organizationId");

-- AddForeignKey
ALTER TABLE "vendor_chats" ADD CONSTRAINT "vendor_chats_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_chats" ADD CONSTRAINT "vendor_chats_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_chat_messages" ADD CONSTRAINT "vendor_chat_messages_vendorChatId_fkey" FOREIGN KEY ("vendorChatId") REFERENCES "vendor_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_chat_messages" ADD CONSTRAINT "vendor_chat_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
