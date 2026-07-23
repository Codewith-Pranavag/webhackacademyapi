import { z } from 'zod';

/** Environment schema — validated at boot; the app refuses to start if invalid. */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:4000'),
  // May be a single origin or a comma-separated list of allowed CORS origins.
  CLIENT_URL: z
    .string()
    .default('http://localhost:3000')
    .refine(
      (val) =>
        val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .every((u) => /^https?:\/\/[^\s,]+$/i.test(u)),
      { message: 'CLIENT_URL must be a comma-separated list of http(s) origins' },
    ),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Razorpay — leave KEY_ID empty to run in local test mode (no external calls).
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default('dev_razorpay_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('dev_razorpay_webhook_secret'),
});

export type Env = z.infer<typeof envSchema>;

/** Passed to ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
