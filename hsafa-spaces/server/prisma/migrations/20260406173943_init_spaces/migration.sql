-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('human', 'agent');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "hsafa_entity_id" TEXT,
    "hsafa_space_id" TEXT,
    "agent_entity_id" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_code" TEXT,
    "verification_code_expiry" TIMESTAMP(3),
    "google_id" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "default_base_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

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
    "invite_code" TEXT,
    "invite_link_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smart_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_space_memberships" (
    "id" UUID NOT NULL,
    "smart_space_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
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
    "edited_at" TIMESTAMPTZ(6),
    "edit_history" JSONB,
    "deleted_at" TIMESTAMPTZ(6),

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

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "smart_space_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "invitee_email" TEXT NOT NULL,
    "invitee_id" UUID,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_responses" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "smart_space_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bases" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "invite_code" TEXT NOT NULL,
    "invite_link_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_members" (
    "id" UUID NOT NULL,
    "base_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "base_members_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "haseef_ownerships" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "haseef_id" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "core_api_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "haseef_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_templates" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "category" TEXT NOT NULL DEFAULT 'prebuilt',
    "config_schema" JSONB NOT NULL DEFAULT '{}',
    "required_profile_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tools" JSONB NOT NULL DEFAULT '[]',
    "instructions" TEXT,
    "source_code" TEXT,
    "image_url" TEXT,
    "author_id" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scope_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_instances" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope_name" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" TEXT,
    "base_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "core_scope_key" TEXT,
    "deployment_type" TEXT NOT NULL DEFAULT 'platform',
    "image_url" TEXT,
    "container_id" TEXT,
    "container_status" TEXT NOT NULL DEFAULT 'stopped',
    "status_message" TEXT,
    "last_health_at" TIMESTAMPTZ(6),
    "port" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scope_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_instance_configs" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scope_instance_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_deployments" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggered_by" TEXT,
    "image_url" TEXT,
    "container_id" TEXT,
    "logs" TEXT NOT NULL DEFAULT '',
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "scope_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haseef_watches" (
    "id" UUID NOT NULL,
    "haseef_id" TEXT NOT NULL,
    "instance_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "where_condition" TEXT,
    "trigger_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "haseef_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "key_hint" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "entities_external_id_key" ON "entities"("external_id");

-- CreateIndex
CREATE INDEX "entities_type_idx" ON "entities"("type");

-- CreateIndex
CREATE INDEX "entities_external_id_idx" ON "entities"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "smart_spaces_invite_code_key" ON "smart_spaces"("invite_code");

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

-- CreateIndex
CREATE INDEX "invitations_invitee_email_status_idx" ON "invitations"("invitee_email", "status");

-- CreateIndex
CREATE INDEX "invitations_invitee_id_status_idx" ON "invitations"("invitee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_smart_space_id_invitee_email_key" ON "invitations"("smart_space_id", "invitee_email");

-- CreateIndex
CREATE INDEX "message_responses_message_id_idx" ON "message_responses"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_responses_message_id_entity_id_key" ON "message_responses"("message_id", "entity_id");

-- CreateIndex
CREATE INDEX "media_assets_entity_id_idx" ON "media_assets"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "bases_invite_code_key" ON "bases"("invite_code");

-- CreateIndex
CREATE INDEX "base_members_entity_id_idx" ON "base_members"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "base_members_base_id_entity_id_key" ON "base_members"("base_id", "entity_id");

-- CreateIndex
CREATE INDEX "haseef_schedules_haseef_id_active_idx" ON "haseef_schedules"("haseef_id", "active");

-- CreateIndex
CREATE INDEX "haseef_schedules_next_run_at_active_idx" ON "haseef_schedules"("next_run_at", "active");

-- CreateIndex
CREATE INDEX "haseef_ownerships_user_id_idx" ON "haseef_ownerships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "haseef_ownerships_user_id_haseef_id_key" ON "haseef_ownerships"("user_id", "haseef_id");

-- CreateIndex
CREATE UNIQUE INDEX "scope_templates_slug_key" ON "scope_templates"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "scope_instances_scope_name_key" ON "scope_instances"("scope_name");

-- CreateIndex
CREATE INDEX "scope_instances_template_id_idx" ON "scope_instances"("template_id");

-- CreateIndex
CREATE INDEX "scope_instances_owner_id_idx" ON "scope_instances"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "scope_instance_configs_instance_id_key_key" ON "scope_instance_configs"("instance_id", "key");

-- CreateIndex
CREATE INDEX "scope_deployments_instance_id_started_at_idx" ON "scope_deployments"("instance_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "haseef_watches_haseef_id_active_idx" ON "haseef_watches"("haseef_id", "active");

-- CreateIndex
CREATE INDEX "haseef_watches_instance_id_idx" ON "haseef_watches"("instance_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_user_id_provider_key" ON "api_keys"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_base_id_fkey" FOREIGN KEY ("default_base_id") REFERENCES "bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_responses" ADD CONSTRAINT "message_responses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "smart_space_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_responses" ADD CONSTRAINT "message_responses_smart_space_id_fkey" FOREIGN KEY ("smart_space_id") REFERENCES "smart_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_responses" ADD CONSTRAINT "message_responses_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_members" ADD CONSTRAINT "base_members_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_members" ADD CONSTRAINT "base_members_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "haseef_ownerships" ADD CONSTRAINT "haseef_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "haseef_ownerships" ADD CONSTRAINT "haseef_ownerships_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_instances" ADD CONSTRAINT "scope_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "scope_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_instances" ADD CONSTRAINT "scope_instances_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_instance_configs" ADD CONSTRAINT "scope_instance_configs_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "scope_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_deployments" ADD CONSTRAINT "scope_deployments_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "scope_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
