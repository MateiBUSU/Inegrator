-- Personal learning space.
--
-- 1. student_policies.note: why a policy version was created, with the real numbers.
ALTER TABLE "student_policies" ADD COLUMN "note" TEXT;

-- 2. Deleting a topic must delete what belongs to it. The init migration used SET NULL, which
--    would orphan a topic's personal materials and, worse, turn its policy rows into GLOBAL
--    policies (topic_id IS NULL).
ALTER TABLE "student_policies" DROP CONSTRAINT "student_policies_topic_id_fkey";
ALTER TABLE "student_policies" ADD CONSTRAINT "student_policies_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "materials" DROP CONSTRAINT "materials_topic_id_fkey";
ALTER TABLE "materials" ADD CONSTRAINT "materials_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
