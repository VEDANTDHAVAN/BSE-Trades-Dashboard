import type IORedis from "ioredis";
import { getSocketServer } from "./socket.server.js";
import { TRADE_EVENTS_CHANNEL } from "./trade-events.publisher.js";

let subscriber: IORedis | null = null;

export async function startTradeEventsSubscriber(
  redis: IORedis,
) {
  if (subscriber) {
    return;
  }

  subscriber = redis.duplicate();

  subscriber.on("error", (error) => {
    console.error("[trade-events] redis error:", error);
  });

  subscriber.on("ready", () => {
    console.log("[trade-events] redis subscriber ready");
  });

  subscriber.on("message", (channel, message) => {
    console.log("[trade-events] message received");
    console.log("channel:", channel);
    console.log("message:", message);

    if (channel !== TRADE_EVENTS_CHANNEL) {
      return;
    }

    try {
      const event = JSON.parse(message);

      console.log("[trade-events] parsed event:", event);

      if (event.type === "trade:created") {
        const io = getSocketServer();

        console.log("[trade-events] emitting trade:created");

        io.emit("trade:created", event.payload);
      }
    } catch (error) {
      console.error(
        "[trade-events] failed to process message:",
        error,
      );
    }
  });

  await subscriber.subscribe(TRADE_EVENTS_CHANNEL);

  console.log(
    `[trade-events] subscribed to ${TRADE_EVENTS_CHANNEL}`,
  );
}

export async function stopTradeEventsSubscriber() {
  if (!subscriber) {
    return;
  }

  await subscriber.unsubscribe(TRADE_EVENTS_CHANNEL);
  await subscriber.quit();

  subscriber = null;
}