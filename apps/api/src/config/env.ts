import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
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
  })
  .superRefine((value, ctx) => {
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
