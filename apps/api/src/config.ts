import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("Invalid PORT");
}

export const config = {
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;
