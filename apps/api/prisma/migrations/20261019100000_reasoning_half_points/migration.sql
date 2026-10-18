-- A PARTIAL reasoning answer is worth half a point, so the score can be fractional.
-- Existing integer scores convert exactly. max_score stays an integer (one point per question).
ALTER TABLE "quiz_attempts" ALTER COLUMN "score" TYPE DOUBLE PRECISION;
