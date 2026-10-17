import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    // env.ts requires these; tests never connect to the database and use throwaway secrets.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234567890",
      TEACHER_SECRET: "test-teacher-secret",
    },
  },
});
