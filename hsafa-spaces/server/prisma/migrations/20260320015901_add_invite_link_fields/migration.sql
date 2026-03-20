/*
  Warnings:

  - A unique constraint covering the columns `[invite_code]` on the table `smart_spaces` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "bases" ADD COLUMN     "invite_link_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "smart_spaces" ADD COLUMN     "invite_code" TEXT,
ADD COLUMN     "invite_link_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "smart_spaces_invite_code_key" ON "smart_spaces"("invite_code");
