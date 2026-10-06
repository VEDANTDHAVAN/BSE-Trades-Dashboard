import http from "node:http";
import { app } from "./app.js";
import { config } from "./config.js";
import { createSocketServer } from "./realtime/socket.js";
import { setSocketServer } from "./realtime/socket.server.js";
import { startTradeEventsSubscriber } from "./realtime/trade-events.subscriber.js";
import redis from "./lib/redis.js";

const httpServer = http.createServer(app);

const io = createSocketServer(httpServer);

setSocketServer(io);
await startTradeEventsSubscriber(redis);

httpServer.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});