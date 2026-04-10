-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "scope_instances" ADD COLUMN     "cloned_from_id" UUID;

-- AlterTable
ALTER TABLE "scope_templates" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "scope_instances_cloned_from_id_idx" ON "scope_instances"("cloned_from_id");

-- AddForeignKey
ALTER TABLE "scope_instances" ADD CONSTRAINT "scope_instances_cloned_from_id_fkey" FOREIGN KEY ("cloned_from_id") REFERENCES "scope_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
