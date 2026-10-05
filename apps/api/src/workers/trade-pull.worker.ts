import { Worker } from "bullmq";
import redis from "../lib/redis";
import { fetchMockBseTrades } from "../clients/mock-bse.client";
import { persistTrades } from "../services/trade-persistence.service";

const worker = new Worker(
  "trade-pull",
  async (job) => {
    const startedAt = Date.now();

    const limit = job.data?.limit ?? 50;

    console.log(
      `[trade-pull] job=${job.id} started limit=${limit}`,
    );

    const trades = await fetchMockBseTrades(limit);

    const result = await persistTrades(trades);

    const durationMs = Date.now() - startedAt;

    console.log(
      `[trade-pull] job=${job.id} completed ` +
        `received=${result.received} ` +
        `inserted=${result.inserted} ` +
        `duplicates=${result.duplicates} ` +
        `durationMs=${durationMs}`,
    );

    return {
      ...result,
      durationMs,
    };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

worker.on("completed", (job) => {
  console.log(`[trade-pull] job=${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(
    `[trade-pull] job=${job?.id} failed:`,
    error,
  );
});

worker.on("error", (error) => {
  console.error("[trade-pull] worker error:", error);
});

async function shutdown(signal: string) {
  console.log(`[trade-pull] received ${signal}`);

  await worker.close();
  await redis.quit();

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.log("[trade-pull] worker started");