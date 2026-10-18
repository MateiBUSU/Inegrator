import { z } from "zod";
import { resolveGeminiKeys } from "../ai/gemini-keys";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
    // Directory of the built web app (Vite dist). When set, the API also serves it; unset in dev.
    WEB_DIST_DIR: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    // Interface to bind. Unset keeps Node's default (all interfaces).
    HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    // Development only: also accept browser origins from private LAN addresses (see lan-origin.ts).
    ALLOW_LAN_ORIGINS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), {
        message: "must be a postgres:// or postgresql:// URL",
      }),
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    TEACHER_SECRET: z.string().min(8, "must be at least 8 characters"),
    // Number of reverse-proxy hops in front of the API (0 = none). Needed for correct client IPs
    // in rate limiting when deployed behind a proxy; never "true", which lets clients spoof IPs.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    // AI engine. The mock provider is the default and needs no network or key; Gemini is opt-in.
    AI_PROVIDER: z.enum(["mock", "gemini"]).default("mock"),
    // An empty value (as in a copied .env.example) counts as unset.
    GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    // Several keys, comma-separated: the next one is used when the current one runs out of quota.
    // Takes precedence over GEMINI_API_KEY when both are set.
    GEMINI_API_KEYS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).default("gemini-3.8-flash")),
    // Generations (and style-notes suggestions) each teacher may request per UTC day.
    AI_DAILY_LIMIT_PER_TEACHER: z.coerce.number().int().min(0).max(10_000).default(20),
    // AI calls (personal lessons, quizzes and tutor replies) each student may make per UTC day,
    // on the same ai_usage counter.
    AI_DAILY_LIMIT_PER_STUDENT: z.coerce.number().int().min(0).max(10_000).default(30),
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER === "gemini" && resolveGeminiKeys(value).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY or GEMINI_API_KEYS is required when AI_PROVIDER=gemini",
      });
    }
    if (value.ALLOW_LAN_ORIGINS && value.NODE_ENV !== "development") {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_LAN_ORIGINS"],
        message: "only allowed when NODE_ENV=development",
      });
    }
    if (value.NODE_ENV !== "production") return;
    for (const key of ["JWT_SECRET", "TEACHER_SECRET"] as const) {
      if (value[key].startsWith("change-me")) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "placeholder value not allowed in production",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    console.error(`Invalid environment configuration: ${details}`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv(process.env);
