-- A material can have at most one child per version number, so a double-clicked or repeated
-- "new version" cannot create two drafts with the same version. Partial: root materials have
-- parent_id NULL and are unaffected. (Prisma cannot express partial indexes in schema.prisma.)
CREATE UNIQUE INDEX "materials_parent_id_version_key" ON "materials"("parent_id", "version") WHERE "parent_id" IS NOT NULL;
