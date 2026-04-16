/*
  Warnings:

  - You are about to drop the column `core_api_key` on the `haseef_ownerships` table. All the data in the column will be lost.
  - You are about to drop the column `config` on the `haseef_skills` table. All the data in the column will be lost.
  - You are about to drop the column `skill_id` on the `haseef_skills` table. All the data in the column will be lost.
  - You are about to drop the `haseef_watches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scope_deployments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scope_instance_configs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scope_instances` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scope_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `skills` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[haseef_id,instance_id]` on the table `haseef_skills` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `instance_id` to the `haseef_skills` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "haseef_skills" DROP CONSTRAINT "haseef_skills_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "scope_deployments" DROP CONSTRAINT "scope_deployments_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "scope_instance_configs" DROP CONSTRAINT "scope_instance_configs_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "scope_instances" DROP CONSTRAINT "scope_instances_base_id_fkey";

-- DropForeignKey
ALTER TABLE "scope_instances" DROP CONSTRAINT "scope_instances_cloned_from_id_fkey";

-- DropForeignKey
ALTER TABLE "scope_instances" DROP CONSTRAINT "scope_instances_template_id_fkey";

-- Drop unique constraint first (it depends on the index)
ALTER TABLE "haseef_skills" DROP CONSTRAINT IF EXISTS "haseef_skills_haseef_id_skill_id_key";
DROP INDEX IF EXISTS "haseef_skills_haseef_id_skill_id_key";
DROP INDEX IF EXISTS "idx_haseef_skills_skill_id";

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "haseef_ownerships" DROP COLUMN "core_api_key";

-- AlterTable
ALTER TABLE "haseef_skills" DROP COLUMN "config",
DROP COLUMN "skill_id",
ADD COLUMN     "instance_id" UUID NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "haseef_watches";

-- DropTable
DROP TABLE "scope_deployments";

-- DropTable
DROP TABLE "scope_instance_configs";

-- DropTable
DROP TABLE "scope_instances";

-- DropTable
DROP TABLE "scope_templates";

-- DropTable
DROP TABLE "skills";

-- CreateTable
CREATE TABLE "skill_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "config_schema" JSONB NOT NULL,
    "tool_definitions" JSONB NOT NULL,
    "instructions" TEXT,
    "icon_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skill_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_instances" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "status_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skill_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_templates_name_key" ON "skill_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_instances_name_key" ON "skill_instances"("name");

-- CreateIndex
CREATE INDEX "skill_instances_user_id_idx" ON "skill_instances"("user_id");

-- CreateIndex
CREATE INDEX "skill_instances_template_id_idx" ON "skill_instances"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "haseef_skills_haseef_id_instance_id_key" ON "haseef_skills"("haseef_id", "instance_id");

-- AddForeignKey
ALTER TABLE "skill_instances" ADD CONSTRAINT "skill_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "skill_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_instances" ADD CONSTRAINT "skill_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "haseef_skills" ADD CONSTRAINT "haseef_skills_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "skill_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_haseef_skills_haseef_id" RENAME TO "haseef_skills_haseef_id_idx";
