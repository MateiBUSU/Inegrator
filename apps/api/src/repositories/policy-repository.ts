import { prisma } from "./prisma-client";

export interface PolicyRecord {
  explanationLevel: string;
  exampleFirst: boolean;
  scaffolding: string;
  hintsEnabled: boolean;
}

/**
 * The student's latest global policy: topic_id IS NULL, highest version. Only the four policy
 * columns are selected; the student id and other columns never leave this function.
 */
export function findLatestGlobalPolicy(studentId: string): Promise<PolicyRecord | null> {
  return prisma.studentPolicy.findFirst({
    where: { studentId, topicId: null },
    orderBy: { version: "desc" },
    select: {
      explanationLevel: true,
      exampleFirst: true,
      scaffolding: true,
      hintsEnabled: true,
    },
  });
}
