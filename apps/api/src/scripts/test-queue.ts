import { tradePullQueue } from "../queues/trade-pull.queue";
import redis from "../lib/redis";

async function main() {
  const job = await tradePullQueue.add("test-pull", {
    limit: 5,
  });

  console.log("Job queued:", job.id);

  await tradePullQueue.close();
  await redis.quit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});