/*
  Warnings:

  - The values [system] on the enum `EntityType` will be removed. If these variants are still used in the database, this will fail.
  - The values [active,paused] on the enum `PlanStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `schedule` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `target_smart_space_id` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `parent_run_id` on the `runs` table. All the data in the column will be lost.
  - Made the column `name` on table `plans` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EntityType_new" AS ENUM ('human', 'agent');
ALTER TABLE "entities" ALTER COLUMN "type" TYPE "EntityType_new" USING ("type"::text::"EntityType_new");
ALTER TYPE "EntityType" RENAME TO "EntityType_old";
ALTER TYPE "EntityType_new" RENAME TO "EntityType";
DROP TYPE "EntityType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PlanStatus_new" AS ENUM ('pending', 'running', 'completed', 'canceled');
ALTER TABLE "plans" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "plans" ALTER COLUMN "status" TYPE "PlanStatus_new" USING ("status"::text::"PlanStatus_new");
ALTER TYPE "PlanStatus" RENAME TO "PlanStatus_old";
ALTER TYPE "PlanStatus_new" RENAME TO "PlanStatus";
DROP TYPE "PlanStatus_old";
ALTER TABLE "plans" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- DropForeignKey
ALTER TABLE "runs" DROP CONSTRAINT "runs_parent_run_id_fkey";

-- DropForeignKey
ALTER TABLE "runs" DROP CONSTRAINT "runs_smart_space_id_fkey";

-- DropIndex
DROP INDEX "runs_parent_run_id_idx";

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "schedule",
DROP COLUMN "target_smart_space_id",
ADD COLUMN     "completed_at" TIMESTAMPTZ(6),
ADD COLUMN     "cron" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduled_at" TIMESTAMPTZ(6),
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "runs" DROP COLUMN "parent_run_id",
ADD COLUMN     "trigger_mention_reason" TEXT,
ADD COLUMN     "trigger_message_content" TEXT,
ADD COLUMN     "trigger_payload" JSONB,
ADD COLUMN     "trigger_plan_id" UUID,
ADD COLUMN     "trigger_plan_name" TEXT,
ADD COLUMN     "trigger_sender_entity_id" UUID,
ADD COLUMN     "trigger_sender_name" TEXT,
ADD COLUMN     "trigger_sender_type" TEXT,
ADD COLUMN     "trigger_service_name" TEXT,
ADD COLUMN     "trigger_space_id" UUID,
ADD COLUMN     "trigger_type" TEXT,
ALTER COLUMN "smart_space_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "smart_spaces" ADD COLUMN     "admin_agent_entity_id" UUID;

-- CreateIndex
CREATE INDEX "runs_agent_entity_id_status_idx" ON "runs"("agent_entity_id", "status");

-- AddForeignKey
ALTER TABLE "smart_spaces" ADD CONSTRAINT "smart_spaces_admin_agent_entity_id_fkey" FOREIGN KEY ("admin_agent_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
