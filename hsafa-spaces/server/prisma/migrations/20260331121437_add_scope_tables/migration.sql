-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

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

-- AddForeignKey
ALTER TABLE "scope_instances" ADD CONSTRAINT "scope_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "scope_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_instances" ADD CONSTRAINT "scope_instances_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_instance_configs" ADD CONSTRAINT "scope_instance_configs_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "scope_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
