-- AlterTable
ALTER TABLE "objective_stats" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CheckConstraint
ALTER TABLE "objective_stats" ADD CONSTRAINT "objective_stats_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);
