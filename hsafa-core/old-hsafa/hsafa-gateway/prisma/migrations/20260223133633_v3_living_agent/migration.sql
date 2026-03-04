-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('human', 'agent');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'waiting_tool', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('pending', 'running', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "InboxEventStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "type" "EntityType" NOT NULL,
    "external_id" TEXT,
    "display_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "agent_id" UUID,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_spaces" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smart_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_space_memberships" (
    "id" UUID NOT NULL,
    "smart_space_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "role" TEXT,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_message_id" UUID,

    CONSTRAINT "smart_space_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_space_messages" (
    "id" UUID NOT NULL,
    "smart_space_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "seq" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "run_id" UUID,

    CONSTRAINT "smart_space_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_json" JSONB NOT NULL,
    "config_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_consciousness" (
    "id" UUID NOT NULL,
    "agent_entity_id" UUID NOT NULL,
    "messages" JSONB NOT NULL,
    "cycle_count" INTEGER NOT NULL DEFAULT 0,
    "token_estimate" INTEGER NOT NULL DEFAULT 0,
    "last_cycle_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_consciousness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "agent_entity_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'running',
    "cycle_number" INTEGER NOT NULL DEFAULT 0,
    "inbox_event_count" INTEGER NOT NULL DEFAULT 0,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "trigger_type" TEXT,
    "trigger_space_id" UUID,
    "trigger_entity_id" UUID,
    "trigger_message_id" UUID,
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
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "client_key" TEXT NOT NULL,
    "client_type" TEXT,
    "display_name" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
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
    "entity_id" UUID NOT NULL,
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
    "entity_id" UUID NOT NULL,
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
    "agent_entity_id" UUID NOT NULL,
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
CREATE TABLE "pending_tool_calls" (
    "id" UUID NOT NULL,
    "agent_entity_id" UUID NOT NULL,
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
CREATE UNIQUE INDEX "entities_external_id_key" ON "entities"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "entities_agent_id_key" ON "entities"("agent_id");

-- CreateIndex
CREATE INDEX "entities_type_idx" ON "entities"("type");

-- CreateIndex
CREATE INDEX "entities_external_id_idx" ON "entities"("external_id");

-- CreateIndex
CREATE INDEX "smart_spaces_created_at_idx" ON "smart_spaces"("created_at");

-- CreateIndex
CREATE INDEX "smart_space_memberships_entity_id_idx" ON "smart_space_memberships"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "smart_space_memberships_smart_space_id_entity_id_key" ON "smart_space_memberships"("smart_space_id", "entity_id");

-- CreateIndex
CREATE INDEX "smart_space_messages_smart_space_id_created_at_idx" ON "smart_space_messages"("smart_space_id", "created_at");

-- CreateIndex
CREATE INDEX "smart_space_messages_entity_id_idx" ON "smart_space_messages"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "smart_space_messages_smart_space_id_seq_key" ON "smart_space_messages"("smart_space_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "agents_name_key" ON "agents"("name");

-- CreateIndex
CREATE INDEX "agents_created_at_idx" ON "agents"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_consciousness_agent_entity_id_key" ON "agent_consciousness"("agent_entity_id");

-- CreateIndex
CREATE INDEX "runs_agent_entity_id_created_at_idx" ON "runs"("agent_entity_id", "created_at");

-- CreateIndex
CREATE INDEX "runs_agent_entity_id_status_idx" ON "runs"("agent_entity_id", "status");

-- CreateIndex
CREATE INDEX "runs_status_updated_at_idx" ON "runs"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "clients_client_key_key" ON "clients"("client_key");

-- CreateIndex
CREATE INDEX "clients_entity_id_idx" ON "clients"("entity_id");

-- CreateIndex
CREATE INDEX "clients_client_type_idx" ON "clients"("client_type");

-- CreateIndex
CREATE INDEX "memories_entity_id_idx" ON "memories"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "memories_entity_id_key_key" ON "memories"("entity_id", "key");

-- CreateIndex
CREATE INDEX "plans_entity_id_status_idx" ON "plans"("entity_id", "status");

-- CreateIndex
CREATE INDEX "plans_next_run_at_status_idx" ON "plans"("next_run_at", "status");

-- CreateIndex
CREATE INDEX "goals_entity_id_status_idx" ON "goals"("entity_id", "status");

-- CreateIndex
CREATE INDEX "goals_entity_id_priority_idx" ON "goals"("entity_id", "priority");

-- CreateIndex
CREATE INDEX "inbox_events_agent_entity_id_status_idx" ON "inbox_events"("agent_entity_id", "status");

-- CreateIndex
CREATE INDEX "inbox_events_run_id_idx" ON "inbox_events"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_agent_entity_id_event_id_key" ON "inbox_events"("agent_entity_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_tool_calls_tool_call_id_key" ON "pending_tool_calls"("tool_call_id");

-- CreateIndex
CREATE INDEX "pending_tool_calls_agent_entity_id_status_idx" ON "pending_tool_calls"("agent_entity_id", "status");

-- CreateIndex
CREATE INDEX "pending_tool_calls_status_expires_at_idx" ON "pending_tool_calls"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_memberships" ADD CONSTRAINT "smart_space_memberships_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_memberships" ADD CONSTRAINT "smart_space_memberships_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_messages" ADD CONSTRAINT "smart_space_messages_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_messages" ADD CONSTRAINT "smart_space_messages_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_messages" ADD CONSTRAINT "smart_space_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_consciousness" ADD CONSTRAINT "agent_consciousness_agent_entity_id_fkey" FOREIGN KEY ("agent_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_entity_id_fkey" FOREIGN KEY ("agent_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_agent_entity_id_fkey" FOREIGN KEY ("agent_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_tool_calls" ADD CONSTRAINT "pending_tool_calls_agent_entity_id_fkey" FOREIGN KEY ("agent_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_tool_calls" ADD CONSTRAINT "pending_tool_calls_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
