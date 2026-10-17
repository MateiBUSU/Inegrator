import { prisma } from "./prisma-client";

export interface TopicRecord {
  id: string;
  studentId: string;
  title: string;
  goal: string;
  createdAt: Date;
}

export interface TopicObjectiveRecord {
  id: string;
  text: string;
}

const TOPIC_OBJECTIVE_CODE = "goal";

const topicSelect = {
  id: true,
  studentId: true,
  title: true,
  goal: true,
  createdAt: true,
} as const;

/**
 * Creates the topic together with its single objective (the student's goal), or nothing at all.
 * The objective is a real catalogue row, so quiz answers link to it and objective_stats and the
 * adaptive policy have something to key on.
 */
export function createTopic(data: {
  studentId: string;
  title: string;
  goal: string;
}): Promise<TopicRecord> {
  return prisma.learningTopic.create({
    data: {
      studentId: data.studentId,
      title: data.title,
      goal: data.goal,
      objectives: { create: { code: TOPIC_OBJECTIVE_CODE, text: data.goal } },
    },
    select: topicSelect,
  });
}

export function countTopicsByStudent(studentId: string): Promise<number> {
  return prisma.learningTopic.count({ where: { studentId } });
}

export function listTopicsByStudent(studentId: string): Promise<TopicRecord[]> {
  return prisma.learningTopic.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: topicSelect,
  });
}

export function findTopicById(id: string): Promise<TopicRecord | null> {
  return prisma.learningTopic.findUnique({ where: { id }, select: topicSelect });
}

export function findTopicObjective(topicId: string): Promise<TopicObjectiveRecord | null> {
  return prisma.objective.findFirst({
    where: { topicId, code: TOPIC_OBJECTIVE_CODE },
    select: { id: true, text: true },
  });
}

/**
 * Deletes a topic and everything that belongs to it, in one transaction.
 *
 * The database cascades topic -> tutor_messages, objectives (-> objective_stats), student_policies
 * and materials (migration 20261017200000_personal_space). Rows that reference a material or an
 * objective WITHOUT a cascade (quiz attempts, lesson progress, recommendations) are deleted
 * first, otherwise the foreign keys would block the delete. attempt_answers go with their attempt.
 */
export async function deleteTopicCascade(topicId: string): Promise<void> {
  await prisma.$transaction([
    prisma.quizAttempt.deleteMany({ where: { material: { topicId } } }),
    prisma.lessonProgress.deleteMany({ where: { material: { topicId } } }),
    prisma.recommendation.deleteMany({
      where: { OR: [{ material: { topicId } }, { objective: { topicId } }] },
    }),
    prisma.learningTopic.delete({ where: { id: topicId } }),
  ]);
}
