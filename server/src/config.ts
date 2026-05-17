import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  CORS_ORIGIN: z.string().default("http://localhost:9001"),
  ZABBIX_URL: z.string().url(),
  ZABBIX_USER: z.string().min(1),
  ZABBIX_PASSWORD: z.string().min(1),
  ZABBIX_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).default(15000),
  ZABBIX_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000)
});

export const config = schema.parse(process.env);
