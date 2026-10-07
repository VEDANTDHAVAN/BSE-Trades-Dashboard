import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);
const mockBseDelayMs = Number(process.env.MOCK_BSE_DELAY_MS ?? 1000);
const mockBseTimeoutMs = Number(process.env.MOCK_BSE_TIMEOUT_MS ?? 960000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("Invalid PORT");
}

if (!Number.isInteger(mockBseDelayMs) || mockBseDelayMs < 0 || mockBseDelayMs > 900000) {
  throw new Error("Invalid MOCK_BSE_DELAY_MS: expected an integer from 0 to 900000");
}

// The worker (not the browser) owns the mock BSE connection, so its timeout must
// outlive the slowest permitted pull. A 15-minute pull would otherwise abort.
if (
  !Number.isInteger(mockBseTimeoutMs) ||
  mockBseTimeoutMs < 1000 ||
  mockBseTimeoutMs < mockBseDelayMs
) {
  throw new Error(
    "Invalid MOCK_BSE_TIMEOUT_MS: expected an integer >= 1000 and >= MOCK_BSE_DELAY_MS",
  );
}

export const config = {
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  mockBse: {
    delayMs: mockBseDelayMs,
    timeoutMs: mockBseTimeoutMs,
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
} as const;
