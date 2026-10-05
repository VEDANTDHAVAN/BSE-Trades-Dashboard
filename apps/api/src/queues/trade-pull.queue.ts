import { Queue } from "bullmq";
import redis from "../lib/redis";

export const TRADE_PULL_QUEUE = "trade-pull";

export const tradePullQueue = new Queue(TRADE_PULL_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3, backoff: {
      type: "exponential", delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});