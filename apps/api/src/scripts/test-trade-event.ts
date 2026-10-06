import redis from "../lib/redis.js";
import {
  TRADE_EVENTS_CHANNEL,
} from "../realtime/trade-events.publisher.js";

const trade = {
  tradeId: "TEST-REDIS-001",
  client: "TEST_CLIENT",
  symbol: "TEST",
  quantity: 10,
  price: 100,
  timestamp: new Date().toISOString(),
};

await redis.publish(
  TRADE_EVENTS_CHANNEL,
  JSON.stringify({
    type: "trade:created",
    payload: trade,
  }),
);

console.log("[publisher-test] trade event published");

await redis.quit();