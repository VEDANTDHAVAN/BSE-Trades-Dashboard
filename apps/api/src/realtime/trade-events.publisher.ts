import redis from "../lib/redis";
import type { PersistedTrade } from "../services/trade-persistence.service";

export const TRADE_EVENTS_CHANNEL = "trade:events";

export interface PullCompletedPayload {
  jobId: string | null;
  received: number;
  inserted: number;
  duplicates: number;
  durationMs: number;
  completedAt: string;
}

export async function publishTradeCreated(
  trade: PersistedTrade,
) {
  await redis.publish(
    TRADE_EVENTS_CHANNEL,
    JSON.stringify({
      type: "trade:created",
      payload: trade,
    }),
  );
}

/**
 * Broadcasts that a pull job finished. Lets the dashboard refresh its queue
 * status and summary without polling — the same event-driven channel used for
 * individual trades.
 */
export async function publishPullCompleted(
  payload: PullCompletedPayload,
) {
  await redis.publish(
    TRADE_EVENTS_CHANNEL,
    JSON.stringify({
      type: "pull:completed",
      payload,
    }),
  );
}