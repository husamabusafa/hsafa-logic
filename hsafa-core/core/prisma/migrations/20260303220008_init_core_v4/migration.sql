-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('pending', 'running', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "InboxEventStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- CreateTable
CREATE TABLE "haseefs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_json" JSONB NOT NULL,
    "config_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "haseefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haseef_consciousness" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "messages" JSONB NOT NULL,
    "cycle_count" INTEGER NOT NULL DEFAULT 0,
    "token_estimate" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "last_cycle_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "haseef_consciousness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'running',
    "cycle_number" INTEGER NOT NULL DEFAULT 0,
    "inbox_event_count" INTEGER NOT NULL DEFAULT 0,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "trigger_type" TEXT,
    "trigger_source" TEXT,
    "trigger_entity_id" UUID,
    "trigger_payload" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "cron" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "status" "PlanStatus" NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_events" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" "InboxEventStatus" NOT NULL DEFAULT 'pending',
    "run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extensions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "extension_key" TEXT NOT NULL,
    "instructions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_tools" (
    "id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "input_schema" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extension_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haseef_extensions" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "extension_id" UUID NOT NULL,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "haseef_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_tool_calls" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "pending_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "haseefs_name_key" ON "haseefs"("name");

-- CreateIndex
CREATE INDEX "haseefs_created_at_idx" ON "haseefs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "haseef_consciousness_haseef_id_key" ON "haseef_consciousness"("haseef_id");

-- CreateIndex
CREATE INDEX "runs_haseef_id_created_at_idx" ON "runs"("haseef_id", "created_at");

-- CreateIndex
CREATE INDEX "runs_haseef_id_status_idx" ON "runs"("haseef_id", "status");

-- CreateIndex
CREATE INDEX "runs_status_updated_at_idx" ON "runs"("status", "updated_at");

-- CreateIndex
CREATE INDEX "memories_haseef_id_idx" ON "memories"("haseef_id");

-- CreateIndex
CREATE UNIQUE INDEX "memories_haseef_id_key_key" ON "memories"("haseef_id", "key");

-- CreateIndex
CREATE INDEX "plans_haseef_id_status_idx" ON "plans"("haseef_id", "status");

-- CreateIndex
CREATE INDEX "plans_next_run_at_status_idx" ON "plans"("next_run_at", "status");

-- CreateIndex
CREATE INDEX "goals_haseef_id_status_idx" ON "goals"("haseef_id", "status");

-- CreateIndex
CREATE INDEX "goals_haseef_id_priority_idx" ON "goals"("haseef_id", "priority");

-- CreateIndex
CREATE INDEX "inbox_events_haseef_id_status_idx" ON "inbox_events"("haseef_id", "status");

-- CreateIndex
CREATE INDEX "inbox_events_run_id_idx" ON "inbox_events"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_haseef_id_event_id_key" ON "inbox_events"("haseef_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "extensions_name_key" ON "extensions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "extensions_extension_key_key" ON "extensions"("extension_key");

-- CreateIndex
CREATE UNIQUE INDEX "extension_tools_extension_id_name_key" ON "extension_tools"("extension_id", "name");

-- CreateIndex
CREATE INDEX "haseef_extensions_haseef_id_idx" ON "haseef_extensions"("haseef_id");

-- CreateIndex
CREATE INDEX "haseef_extensions_extension_id_idx" ON "haseef_extensions"("extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "haseef_extensions_haseef_id_extension_id_key" ON "haseef_extensions"("haseef_id", "extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_tool_calls_tool_call_id_key" ON "pending_tool_calls"("tool_call_id");

-- CreateIndex
CREATE INDEX "pending_tool_calls_haseef_id_status_idx" ON "pending_tool_calls"("haseef_id", "status");

-- CreateIndex
CREATE INDEX "pending_tool_calls_status_expires_at_idx" ON "pending_tool_calls"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "haseef_consciousness" ADD CONSTRAINT "haseef_consciousness_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_tools" ADD CONSTRAINT "extension_tools_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "haseef_extensions" ADD CONSTRAINT "haseef_extensions_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "haseef_extensions" ADD CONSTRAINT "haseef_extensions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_tool_calls" ADD CONSTRAINT "pending_tool_calls_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_tool_calls" ADD CONSTRAINT "pending_tool_calls_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
