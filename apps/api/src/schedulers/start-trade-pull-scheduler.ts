import { registerTradePullSchedule } from "./trade-pull.scheduler";
import { tradePullQueue } from "../queues/trade-pull.queue";
import redis from "../lib/redis";

async function main() {
  await registerTradePullSchedule();

  console.log("[trade-pull] scheduler started");
}

async function shutdown(signal: string) {
  console.log(`[trade-pull] scheduler received ${signal}`);

  await tradePullQueue.close();
  await redis.quit();

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

main().catch(async (error) => {
  console.error("[trade-pull] scheduler failed:", error);

  await tradePullQueue.close();
  await redis.quit();

  process.exit(1);
});