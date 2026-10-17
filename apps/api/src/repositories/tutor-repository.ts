import { prisma } from "./prisma-client";

export interface TutorMessageRecord {
  id: string;
  role: "user" | "tutor";
  content: string;
  createdAt: Date;
}

/** The last `take` messages of one student's chat in one topic, oldest first. */
export async function listRecentMessages(
  studentId: string,
  topicId: string,
  take: number,
): Promise<TutorMessageRecord[]> {
  const rows = await prisma.tutorMessage.findMany({
    where: { studentId, topicId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return rows.reverse();
}

/**
 * Saves the student's message and the tutor's reply together, so a failed turn never leaves a
 * lone question behind. The reply gets a later timestamp, which keeps the order stable.
 */
export async function appendExchange(data: {
  studentId: string;
  topicId: string;
  userContent: string;
  tutorContent: string;
}): Promise<TutorMessageRecord> {
  const now = Date.now();
  const [, reply] = await prisma.$transaction([
    prisma.tutorMessage.create({
      data: {
        studentId: data.studentId,
        topicId: data.topicId,
        role: "user",
        content: data.userContent,
        createdAt: new Date(now),
      },
    }),
    prisma.tutorMessage.create({
      data: {
        studentId: data.studentId,
        topicId: data.topicId,
        role: "tutor",
        content: data.tutorContent,
        createdAt: new Date(now + 1),
      },
      select: { id: true, role: true, content: true, createdAt: true },
    }),
  ]);
  return reply;
}
