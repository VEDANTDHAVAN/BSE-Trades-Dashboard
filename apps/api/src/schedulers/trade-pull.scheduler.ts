import { tradePullQueue } from "../queues/trade-pull.queue";

const intervalMs = Number(
  process.env.TRADE_PULL_INTERVAL_MS ?? 900000,
);

export async function registerTradePullSchedule() {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
    throw new Error(
      "TRADE_PULL_INTERVAL_MS must be at least 1000 milliseconds",
    );
  }

  await tradePullQueue.upsertJobScheduler(
    "trade-pull-recurring",
    {
      every: intervalMs,
    },
    {
      name: "scheduled-trade-pull",
      data: {
        limit: 50,
      },
    },
  );

  console.log(
    `[trade-pull] scheduler registered every ${intervalMs}ms`,
  );
}