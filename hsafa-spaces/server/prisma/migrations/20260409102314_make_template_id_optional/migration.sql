-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "scope_instances" ALTER COLUMN "template_id" DROP NOT NULL;
