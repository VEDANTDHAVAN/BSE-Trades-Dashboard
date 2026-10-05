import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);
const mockBseDelayMs = Number(process.env.MOCK_BSE_DELAY_MS ?? 1000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("Invalid PORT");
}

if (!Number.isInteger(mockBseDelayMs) || mockBseDelayMs < 0 || mockBseDelayMs > 900000) {
  throw new Error("Invalid MOCK_BSE_DELAY_MS: expected an integer from 0 to 900000");
}

export const config = {
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  mockBse: {
    delayMs: mockBseDelayMs,
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
} as const;
