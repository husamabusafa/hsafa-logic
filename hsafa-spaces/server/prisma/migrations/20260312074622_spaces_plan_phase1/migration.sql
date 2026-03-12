/*
  Warnings:

  - Made the column `role` on table `smart_space_memberships` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "smart_space_memberships" ALTER COLUMN "role" SET NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'member';

-- AlterTable
ALTER TABLE "smart_space_messages" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "edit_history" JSONB,
ADD COLUMN     "edited_at" TIMESTAMPTZ(6);

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
CREATE TABLE "haseef_ownerships" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "haseef_id" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "haseef_ownerships_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "haseef_ownerships_user_id_idx" ON "haseef_ownerships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "haseef_ownerships_user_id_haseef_id_key" ON "haseef_ownerships"("user_id", "haseef_id");

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
ALTER TABLE "haseef_ownerships" ADD CONSTRAINT "haseef_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "haseef_ownerships" ADD CONSTRAINT "haseef_ownerships_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
