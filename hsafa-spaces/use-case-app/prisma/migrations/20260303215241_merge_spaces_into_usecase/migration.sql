-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('human', 'agent');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "type" "EntityType" NOT NULL,
    "external_id" TEXT,
    "display_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

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

    CONSTRAINT "smart_space_messages_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "entities_external_id_key" ON "entities"("external_id");

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
CREATE UNIQUE INDEX "clients_client_key_key" ON "clients"("client_key");

-- CreateIndex
CREATE INDEX "clients_entity_id_idx" ON "clients"("entity_id");

-- CreateIndex
CREATE INDEX "clients_client_type_idx" ON "clients"("client_type");

-- AddForeignKey
ALTER TABLE "smart_space_memberships" ADD CONSTRAINT "smart_space_memberships_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_memberships" ADD CONSTRAINT "smart_space_memberships_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_messages" ADD CONSTRAINT "smart_space_messages_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_space_messages" ADD CONSTRAINT "smart_space_messages_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
