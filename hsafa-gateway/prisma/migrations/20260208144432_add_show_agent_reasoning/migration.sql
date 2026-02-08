-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "smart_spaces" ADD COLUMN     "show_agent_reasoning" BOOLEAN NOT NULL DEFAULT false;
