-- A CHECK passes when its expression is NULL, so `grade BETWEEN 9 AND 12` alone
-- let (section = 'programa', grade = NULL) through. Require grade IS NOT NULL explicitly.
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_section_language_grade_check";

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_section_language_grade_check" CHECK (
  ("section" = 'bac' AND "language" = 'cpp' AND "grade" IS NULL)
  OR ("section" = 'programa' AND "grade" IS NOT NULL AND "grade" BETWEEN 9 AND 12)
);
