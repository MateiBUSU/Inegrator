-- CreateEnum
CREATE TYPE "role" AS ENUM ('student', 'teacher');

-- CreateEnum
CREATE TYPE "section" AS ENUM ('programa', 'bac');

-- CreateEnum
CREATE TYPE "language" AS ENUM ('cpp', 'python');

-- CreateEnum
CREATE TYPE "material_scope" AS ENUM ('class', 'personal');

-- CreateEnum
CREATE TYPE "material_kind" AS ENUM ('lesson', 'test', 'problem', 'exercise');

-- CreateEnum
CREATE TYPE "material_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "material_source" AS ENUM ('manual', 'ai', 'document_based');

-- CreateEnum
CREATE TYPE "progress_status" AS ENUM ('started', 'completed');

-- CreateEnum
CREATE TYPE "recommendation_status" AS ENUM ('open', 'done', 'dismissed');

-- CreateEnum
CREATE TYPE "document_source_type" AS ENUM ('pasted', 'uploaded');

-- CreateEnum
CREATE TYPE "tutor_role" AS ENUM ('user', 'tutor');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "join_code" TEXT NOT NULL,
    "style_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("class_id","student_id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" "section" NOT NULL,
    "language" "language" NOT NULL,
    "grade" INTEGER,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_topics" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" UUID NOT NULL,
    "chapter_id" UUID,
    "topic_id" UUID,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_documents" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" "document_source_type" NOT NULL DEFAULT 'pasted',
    "mime" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "scope" "material_scope" NOT NULL,
    "kind" "material_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "material_status" NOT NULL DEFAULT 'draft',
    "source" "material_source" NOT NULL,
    "subject_id" UUID,
    "chapter_id" UUID,
    "topic_id" UUID,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_id" UUID,
    "based_on_document_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_assignments" (
    "material_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_assignments_pkey" PRIMARY KEY ("material_id","class_id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "objective_id" UUID,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "student_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "status" "progress_status" NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("student_id","material_id")
);

-- CreateTable
CREATE TABLE "objective_stats" (
    "student_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "last_practiced_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "objective_stats_pkey" PRIMARY KEY ("student_id","objective_id")
);

-- CreateTable
CREATE TABLE "student_policies" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "topic_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "explanation_level" TEXT NOT NULL,
    "example_first" BOOLEAN NOT NULL,
    "scaffolding" TEXT NOT NULL,
    "hints_enabled" BOOLEAN NOT NULL,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "material_id" UUID,
    "rule_code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "recommendation_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_messages" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "role" "tutor_role" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "classes_join_code_key" ON "classes"("join_code");

-- CreateIndex
CREATE INDEX "classes_teacher_id_idx" ON "classes"("teacher_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_slug_key" ON "subjects"("slug");

-- CreateIndex
CREATE INDEX "chapters_subject_id_idx" ON "chapters"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_subject_id_position_key" ON "chapters"("subject_id", "position");

-- CreateIndex
CREATE INDEX "learning_topics_student_id_idx" ON "learning_topics"("student_id");

-- CreateIndex
CREATE INDEX "objectives_chapter_id_idx" ON "objectives"("chapter_id");

-- CreateIndex
CREATE INDEX "objectives_topic_id_idx" ON "objectives"("topic_id");

-- CreateIndex
CREATE INDEX "teacher_documents_class_id_idx" ON "teacher_documents"("class_id");

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_id_position_key" ON "document_chunks"("document_id", "position");

-- CreateIndex
CREATE INDEX "materials_owner_id_status_idx" ON "materials"("owner_id", "status");

-- CreateIndex
CREATE INDEX "materials_topic_id_idx" ON "materials"("topic_id");

-- CreateIndex
CREATE INDEX "material_assignments_class_id_idx" ON "material_assignments"("class_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_student_id_material_id_idx" ON "quiz_attempts"("student_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "objective_stats_student_id_idx" ON "objective_stats"("student_id");

-- CreateIndex
CREATE INDEX "student_policies_student_id_topic_id_idx" ON "student_policies"("student_id", "topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_policies_student_id_topic_id_version_key" ON "student_policies"("student_id", "topic_id", "version");

-- CreateIndex
CREATE INDEX "tutor_messages_student_id_topic_id_created_at_idx" ON "tutor_messages"("student_id", "topic_id", "created_at");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "teacher_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_assignments" ADD CONSTRAINT "material_assignments_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_assignments" ADD CONSTRAINT "material_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective_stats" ADD CONSTRAINT "objective_stats_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective_stats" ADD CONSTRAINT "objective_stats_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_policies" ADD CONSTRAINT "student_policies_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_policies" ADD CONSTRAINT "student_policies_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written constraints below (not expressible in schema.prisma).

-- CheckConstraint
ALTER TABLE "classes" ADD CONSTRAINT "classes_grade_check" CHECK ("grade" BETWEEN 9 AND 12);

-- CheckConstraint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_section_language_grade_check" CHECK (
  ("section" = 'bac' AND "language" = 'cpp' AND "grade" IS NULL)
  OR ("section" = 'programa' AND "grade" BETWEEN 9 AND 12)
);

-- CheckConstraint: exactly one parent
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_exactly_one_parent_check" CHECK (
  ("chapter_id" IS NOT NULL AND "topic_id" IS NULL)
  OR ("chapter_id" IS NULL AND "topic_id" IS NOT NULL)
);

-- CreateIndex: partial unique indexes for objective codes
CREATE UNIQUE INDEX "objectives_chapter_id_code_key" ON "objectives"("chapter_id", "code") WHERE "chapter_id" IS NOT NULL;
CREATE UNIQUE INDEX "objectives_topic_id_code_key" ON "objectives"("topic_id", "code") WHERE "topic_id" IS NOT NULL;

-- CheckConstraint
ALTER TABLE "materials" ADD CONSTRAINT "materials_scope_check" CHECK (
  ("scope" = 'class' AND "topic_id" IS NULL)
  OR ("scope" = 'personal' AND "subject_id" IS NULL AND "chapter_id" IS NULL)
);

-- CheckConstraint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_score_check" CHECK ("score" >= 0 AND "score" <= "max_score");

-- CheckConstraint
ALTER TABLE "objective_stats" ADD CONSTRAINT "objective_stats_counters_check" CHECK (
  "attempts" >= 0 AND "correct" >= 0 AND "hints_used" >= 0 AND "correct" <= "attempts"
);

-- CheckConstraint
ALTER TABLE "student_policies" ADD CONSTRAINT "student_policies_version_check" CHECK ("version" >= 1);

-- CheckConstraint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_count_check" CHECK ("count" >= 0);
