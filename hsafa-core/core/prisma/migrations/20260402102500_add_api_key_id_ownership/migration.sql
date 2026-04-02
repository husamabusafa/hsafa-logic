-- AlterTable: Add apiKeyId to haseefs for ownership tracking
ALTER TABLE "haseefs" ADD COLUMN "api_key_id" TEXT;

-- AlterTable: Add apiKeyId to scopes for ownership tracking
ALTER TABLE "scopes" ADD COLUMN "api_key_id" TEXT;

-- AlterTable: Change default scopes to include "spaces"
ALTER TABLE "haseefs" ALTER COLUMN "scopes" SET DEFAULT ARRAY['spaces']::text[];
