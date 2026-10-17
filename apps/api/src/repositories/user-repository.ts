import type { Role, User } from "../generated/prisma/client";
import { isUniqueViolation } from "./prisma-errors";
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
    // users.email is the only unique column besides the id
    if (isUniqueViolation(err)) throw new DuplicateEmailError();
    throw err;
  }
}
