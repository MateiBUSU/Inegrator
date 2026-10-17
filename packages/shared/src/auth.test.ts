import { describe, expect, it } from "vitest";
import { loginRequestSchema, registerRequestSchema } from "./auth";

const valid = {
  email: "  Ana@Example.COM ",
  password: "parola-lunga",
  role: "student",
  display_name: " Ana ",
};

describe("registerRequestSchema", () => {
  it("trims and lowercases the email and trims the display name", () => {
    const parsed = registerRequestSchema.parse(valid);
    expect(parsed.email).toBe("ana@example.com");
    expect(parsed.display_name).toBe("Ana");
  });

  it("rejects short passwords, bad emails and unknown roles", () => {
    expect(registerRequestSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("normalizes the email and requires a password", () => {
    expect(loginRequestSchema.parse({ email: "A@B.ro", password: "x" }).email).toBe("a@b.ro");
    expect(loginRequestSchema.safeParse({ email: "a@b.ro", password: "" }).success).toBe(false);
  });
});
