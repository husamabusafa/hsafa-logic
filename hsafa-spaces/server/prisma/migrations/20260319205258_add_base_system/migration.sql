-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_base_id" UUID;

-- CreateTable
CREATE TABLE "bases" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "invite_code" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "bases_invite_code_key" ON "bases"("invite_code");

-- CreateIndex
CREATE INDEX "base_members_entity_id_idx" ON "base_members"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "base_members_base_id_entity_id_key" ON "base_members"("base_id", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_base_id_fkey" FOREIGN KEY ("default_base_id") REFERENCES "bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_members" ADD CONSTRAINT "base_members_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_members" ADD CONSTRAINT "base_members_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
