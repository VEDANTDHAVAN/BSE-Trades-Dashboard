import { tradePullQueue } from "../queues/trade-pull.queue.js";
import redis from "../lib/redis.js";

/**
 * Removes the recurring "trade-pull-recurring" repeatable job from Redis.
 *
 * The recurring scheduler is an OPTIONAL, independent feature for continuous
 * background ingestion. The dashboard does NOT depend on it — it receives
 * trades via Socket.IO events triggered by on-demand pulls. This script exists
 * so a demo/test can run with the scheduler disabled and prove the dashboard
 * is fully event-driven (no cron, no polling).
 */
async function main() {
  await tradePullQueue.removeJobScheduler("trade-pull-recurring");
  console.log(
    "[remove-scheduler] removed 'trade-pull-recurring' repeatable job",
  );
  await tradePullQueue.close();
  await redis.quit();
}

main().catch((error) => {
  console.error("[remove-scheduler] failed:", error);
  process.exit(1);
});
