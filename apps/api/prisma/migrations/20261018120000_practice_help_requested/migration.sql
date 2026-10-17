-- A student who is capped out of the practice loop can ask the teacher for help.
ALTER TABLE "objective_progress" ADD COLUMN "help_requested_at" TIMESTAMPTZ(6);
