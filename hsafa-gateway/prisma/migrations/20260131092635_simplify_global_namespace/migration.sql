/*
  Warnings:

  - You are about to drop the column `tenant_id` on the `agents` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `devices` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `runs` table. All the data in the column will be lost.
  - You are about to drop the `device_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenants` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `agents` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[device_key]` on the table `devices` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "agents" DROP CONSTRAINT "agents_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "device_sessions" DROP CONSTRAINT "device_sessions_device_id_fkey";

-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "runs" DROP CONSTRAINT "runs_tenant_id_fkey";

-- DropIndex
DROP INDEX "agents_tenant_id_created_at_idx";

-- DropIndex
DROP INDEX "agents_tenant_id_name_key";

-- DropIndex
DROP INDEX "devices_tenant_id_created_at_idx";

-- DropIndex
DROP INDEX "devices_tenant_id_device_key_key";

-- DropIndex
DROP INDEX "runs_tenant_id_created_at_idx";

-- AlterTable
ALTER TABLE "agents" DROP COLUMN "tenant_id";

-- AlterTable
ALTER TABLE "devices" DROP COLUMN "tenant_id",
ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "runs" DROP COLUMN "tenant_id";

-- DropTable
DROP TABLE "device_sessions";

-- DropTable
DROP TABLE "tenants";

-- CreateIndex
CREATE UNIQUE INDEX "agents_name_key" ON "agents"("name");

-- CreateIndex
CREATE INDEX "agents_created_at_idx" ON "agents"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_key_key" ON "devices"("device_key");

-- CreateIndex
CREATE INDEX "devices_created_at_idx" ON "devices"("created_at");

-- CreateIndex
CREATE INDEX "runs_created_at_idx" ON "runs"("created_at");
