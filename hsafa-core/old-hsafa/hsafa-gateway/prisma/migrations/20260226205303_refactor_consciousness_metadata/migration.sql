-- AlterTable
ALTER TABLE "agent_consciousness" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;
