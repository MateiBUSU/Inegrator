import type { Role, User } from "../generated/prisma/client";
import { prisma } from "./prisma-client";

export type UserRecord = User;

export interface NewUser {
  email: string;
  passwordHash: string;
  role: Role;
  displayName: string;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email already registered");
  }
}

export function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: NewUser): Promise<UserRecord> {
  try {
    return await prisma.user.create({ data });
  } catch (err) {
    // P2002 = unique constraint violation (users.email)
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      throw new DuplicateEmailError();
    }
    throw err;
  }
}
