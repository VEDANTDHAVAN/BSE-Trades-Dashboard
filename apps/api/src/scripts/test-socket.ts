import { io } from "socket.io-client";
import redis from "../lib/redis.js";
import {
  TRADE_EVENTS_CHANNEL,
} from "../realtime/trade-events.publisher.js";

const socket = io("http://localhost:4000", {
  transports: ["websocket"],
});

socket.on("connect", async () => {
  console.log(`[socket-test] connected ${socket.id}`);
  console.log("[socket-test] publishing trade event...");

  await redis.publish(
    TRADE_EVENTS_CHANNEL,
    JSON.stringify({
      type: "trade:created",
      payload: {
        tradeId: "TEST-REDIS-002",
        client: "TEST_CLIENT",
        symbol: "TEST",
        quantity: 25,
        price: 150,
        timestamp: new Date().toISOString(),
      },
    }),
  );
});

socket.on("trade:created", async (trade) => {
  console.log("[socket-test] trade:created");
  console.log(trade);

  socket.disconnect();
  await redis.quit();
});

socket.on("disconnect", (reason) => {
  console.log(`[socket-test] disconnected reason=${reason}`);
  process.exit(0);
});

socket.on("connect_error", (error) => {
  console.error("[socket-test] connection error:", error);
  process.exit(1);
});

setTimeout(() => {
  console.error("[socket-test] timeout waiting for trade:created");
  socket.disconnect();
}, 10000);