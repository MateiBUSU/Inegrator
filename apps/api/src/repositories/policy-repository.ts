import { prisma } from "./prisma-client";
import { isUniqueViolation } from "./prisma-errors";

export interface PolicyRecord {
  explanationLevel: string;
  exampleFirst: boolean;
  scaffolding: string;
  hintsEnabled: boolean;
}

export interface PolicyVersionRecord extends PolicyRecord {
  version: number;
  reasonCode: string | null;
  note: string | null;
  createdAt: Date;
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

const versionSelect = {
  version: true,
  explanationLevel: true,
  exampleFirst: true,
  scaffolding: true,
  hintsEnabled: true,
  reasonCode: true,
  note: true,
  createdAt: true,
} as const;

/** The highest-version policy row for one student and one topic (null topic = the global one). */
export function findLatestPolicyVersion(
  studentId: string,
  topicId: string | null,
): Promise<PolicyVersionRecord | null> {
  return prisma.studentPolicy.findFirst({
    where: { studentId, topicId },
    orderBy: { version: "desc" },
    select: versionSelect,
  });
}

/**
 * Appends a policy version. Rows are never updated. Returns false when another request already
 * wrote this version (unique on student, topic, version), so a race cannot create two.
 *
 * ONLY the adaptation service may call this. The AI layer has no access to this module.
 */
export async function insertTopicPolicyVersion(data: {
  studentId: string;
  topicId: string;
  version: number;
  explanationLevel: string;
  exampleFirst: boolean;
  scaffolding: string;
  hintsEnabled: boolean;
  reasonCode: string;
  note: string;
}): Promise<boolean> {
  try {
    await prisma.studentPolicy.create({ data });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}
