-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- CreateTable
CREATE TABLE "haseef_schedules" (
    "id" UUID NOT NULL,
    "haseef_id" TEXT NOT NULL,
    "agent_entity_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cron_expression" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "haseef_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "haseef_schedules_haseef_id_active_idx" ON "haseef_schedules"("haseef_id", "active");

-- CreateIndex
CREATE INDEX "haseef_schedules_next_run_at_active_idx" ON "haseef_schedules"("next_run_at", "active");
