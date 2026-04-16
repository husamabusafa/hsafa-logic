-- Rename scope → skill (data-preserving)

-- 1. Rename columns on haseefs and runs
ALTER TABLE "haseefs" RENAME COLUMN "scopes" TO "skills";
ALTER TABLE "runs" RENAME COLUMN "trigger_scope" TO "trigger_skill";

-- 2. Drop old FK + indexes on scope_tools before renaming
ALTER TABLE "scope_tools" DROP CONSTRAINT IF EXISTS "scope_tools_scope_id_fkey";
DROP INDEX IF EXISTS "scope_tools_scope_id_idx";
DROP INDEX IF EXISTS "scope_tools_scope_id_name_key";

-- 3. Rename scope_tools table and its columns
ALTER TABLE "scope_tools" RENAME TO "skill_tools";
ALTER TABLE "skill_tools" RENAME COLUMN "scope_id" TO "skill_id";

-- 4. Rename scopes table
ALTER TABLE "scopes" RENAME TO "skills";

-- 5. Recreate indexes + FK with new names
ALTER TABLE "skills" RENAME CONSTRAINT "scopes_pkey" TO "skills_pkey";
ALTER INDEX IF EXISTS "scopes_name_key" RENAME TO "skills_name_key";

ALTER TABLE "skill_tools" RENAME CONSTRAINT "scope_tools_pkey" TO "skill_tools_pkey";
CREATE INDEX "skill_tools_skill_id_idx" ON "skill_tools"("skill_id");
CREATE UNIQUE INDEX "skill_tools_skill_id_name_key" ON "skill_tools"("skill_id", "name");

ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Drop the core_api_keys table (no longer needed)
DROP TABLE IF EXISTS "core_api_keys";
