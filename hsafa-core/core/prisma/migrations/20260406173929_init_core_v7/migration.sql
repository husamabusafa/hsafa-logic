-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'completed', 'interrupted', 'failed');

-- CreateTable
CREATE TABLE "haseefs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "profile_json" JSONB,
    "config_json" JSONB NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['spaces']::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "haseefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scopes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_tools" (
    "id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "input_schema" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scope_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'running',
    "trigger_scope" TEXT,
    "trigger_type" TEXT,
    "summary" TEXT,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodic_memories" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "run_id" UUID,
    "summary" TEXT NOT NULL,
    "context" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episodic_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_memories" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "last_recalled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semantic_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_memories" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "entity_name" TEXT NOT NULL,
    "observations" JSONB,
    "relationship" TEXT,
    "last_interaction" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_api_keys" (
    "id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedural_memories" (
    "id" UUID NOT NULL,
    "haseef_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procedural_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "haseefs_name_key" ON "haseefs"("name");

-- CreateIndex
CREATE INDEX "haseefs_created_at_idx" ON "haseefs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scopes_name_key" ON "scopes"("name");

-- CreateIndex
CREATE INDEX "scope_tools_scope_id_idx" ON "scope_tools"("scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "scope_tools_scope_id_name_key" ON "scope_tools"("scope_id", "name");

-- CreateIndex
CREATE INDEX "runs_haseef_id_created_at_idx" ON "runs"("haseef_id", "created_at");

-- CreateIndex
CREATE INDEX "runs_haseef_id_status_idx" ON "runs"("haseef_id", "status");

-- CreateIndex
CREATE INDEX "runs_status_updated_at_idx" ON "runs"("status", "updated_at");

-- CreateIndex
CREATE INDEX "episodic_memories_haseef_id_idx" ON "episodic_memories"("haseef_id");

-- CreateIndex
CREATE INDEX "episodic_memories_haseef_id_created_at_idx" ON "episodic_memories"("haseef_id", "created_at");

-- CreateIndex
CREATE INDEX "semantic_memories_haseef_id_idx" ON "semantic_memories"("haseef_id");

-- CreateIndex
CREATE INDEX "semantic_memories_haseef_id_importance_idx" ON "semantic_memories"("haseef_id", "importance");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_memories_haseef_id_key_key" ON "semantic_memories"("haseef_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "social_memories_haseef_id_entity_name_key" ON "social_memories"("haseef_id", "entity_name");

-- CreateIndex
CREATE UNIQUE INDEX "core_api_keys_key_hash_key" ON "core_api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "core_api_keys_key_type_resource_id_idx" ON "core_api_keys"("key_type", "resource_id");

-- CreateIndex
CREATE INDEX "procedural_memories_haseef_id_idx" ON "procedural_memories"("haseef_id");

-- AddForeignKey
ALTER TABLE "scope_tools" ADD CONSTRAINT "scope_tools_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_memories" ADD CONSTRAINT "social_memories_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedural_memories" ADD CONSTRAINT "procedural_memories_haseef_id_fkey" FOREIGN KEY ("haseef_id") REFERENCES "haseefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
