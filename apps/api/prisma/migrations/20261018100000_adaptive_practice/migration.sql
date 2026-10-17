-- Adaptive practice loop: exercise -> mistake -> feedback + new explanation strategy -> next exercise.
CREATE TYPE "explanation_strategy" AS ENUM ('ANALOGIE', 'PAS_CU_PAS', 'EXEMPLU_LUCRAT', 'EXPLICATIE_VIZUALA', 'PARCURGERE_COD', 'INTREBARE_SOCRATICA');
CREATE TYPE "objective_progress_status" AS ENUM ('not_started', 'struggling', 'mastered');

CREATE TABLE "objective_progress" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "status" "objective_progress_status" NOT NULL DEFAULT 'not_started',
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "strategies_tried" "explanation_strategy"[] DEFAULT ARRAY[]::"explanation_strategy"[],
    "current_explanation" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "objective_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_exercises" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "question" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),

    CONSTRAINT "practice_exercises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_attempts" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "exercise_content" TEXT NOT NULL,
    "submitted_answer" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "feedback_text" TEXT,
    "strategy_used" "explanation_strategy",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "objective_progress_student_id_objective_id_key" ON "objective_progress"("student_id", "objective_id");
CREATE INDEX "practice_exercises_student_id_objective_id_idx" ON "practice_exercises"("student_id", "objective_id");
CREATE UNIQUE INDEX "practice_attempts_exercise_id_key" ON "practice_attempts"("exercise_id");
CREATE INDEX "practice_attempts_student_id_objective_id_idx" ON "practice_attempts"("student_id", "objective_id");

ALTER TABLE "objective_progress" ADD CONSTRAINT "objective_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "objective_progress" ADD CONSTRAINT "objective_progress_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_exercises" ADD CONSTRAINT "practice_exercises_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_exercises" ADD CONSTRAINT "practice_exercises_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "practice_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
