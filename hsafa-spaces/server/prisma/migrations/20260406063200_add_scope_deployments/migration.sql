-- CreateTable
CREATE TABLE "scope_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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

-- CreateIndex
CREATE INDEX "scope_deployments_instance_id_started_at_idx" ON "scope_deployments"("instance_id", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "scope_deployments" ADD CONSTRAINT "scope_deployments_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "scope_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
