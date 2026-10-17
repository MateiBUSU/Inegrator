import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    // env.ts requires DATABASE_URL; tests never connect to it.
    env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test" },
  },
});
