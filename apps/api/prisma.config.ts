import { defineConfig } from "prisma/config";

// Node does not load .env on its own; the file is optional (CI or prod set real env vars).
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    // Empty fallback lets `prisma validate` and `prisma generate` run without a database.
    url: process.env.DATABASE_URL ?? "",
  },
});
