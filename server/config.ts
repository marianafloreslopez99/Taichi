import { z } from 'zod'

process.loadEnvFile?.('.env')

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SERVICE_API_KEY: z.string().min(16).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SERVICE_API_KEY: process.env.SERVICE_API_KEY,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
})
