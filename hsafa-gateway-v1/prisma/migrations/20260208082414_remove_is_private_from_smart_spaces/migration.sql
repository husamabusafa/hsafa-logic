/*
  Warnings:

  - You are about to drop the column `is_private` on the `smart_spaces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "smart_spaces" DROP COLUMN "is_private";
