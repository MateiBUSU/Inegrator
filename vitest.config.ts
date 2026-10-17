import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.ts"],
    // Node by default; web component tests opt into jsdom with `// @vitest-environment jsdom`.
    environment: "node",
    // Some API tests run a dozen real argon2 hashes and the suite runs files in parallel, so
    // the 5 s default is too tight when the machine is busy.
    testTimeout: 20_000,
    // env.ts requires these; tests never connect to the database and use throwaway secrets.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234567890",
      TEACHER_SECRET: "test-teacher-secret",
      // Small daily quota so the quota tests are quick. AI_PROVIDER is left unset: mock.
      AI_DAILY_LIMIT_PER_TEACHER: "3",
      AI_DAILY_LIMIT_PER_STUDENT: "3",
    },
  },
});
