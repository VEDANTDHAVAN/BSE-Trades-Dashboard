import redis from "../lib/redis";
import type { PersistedTrade } from "../services/trade-persistence.service";

export const TRADE_EVENTS_CHANNEL = "trade:events";

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