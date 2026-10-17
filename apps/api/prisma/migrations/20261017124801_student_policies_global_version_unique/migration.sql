-- unique(student_id, topic_id, version) does not cover global policies: NULL topic_id values
-- are distinct in a unique index. Enforce version uniqueness for topic-less rows separately.
CREATE UNIQUE INDEX "student_policies_student_global_version_key" ON "student_policies"("student_id", "version") WHERE "topic_id" IS NULL;
