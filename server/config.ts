import { z } from 'zod'

process.loadEnvFile?.('.env')

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SERVICE_API_KEY: z.string().min(16).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.1-pro-preview'),
  GEMINI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(30_000),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
})

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SERVICE_API_KEY: process.env.SERVICE_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? process.env.API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_TIMEOUT_MS: process.env.GEMINI_TIMEOUT_MS,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
})
