import { io } from "socket.io-client";
import { config } from "../config.js";

const API_URL = `http://localhost:${config.port}`;
const LIMIT = 5;
/** A pull cannot emit events before the mock BSE responds. */
const EVENT_BUDGET_MS = config.mockBse.delayMs + 30_000;

const socket = io(API_URL, { transports: ["websocket"] });

const received: Array<{
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
}> = [];

let pullJobId: string | null = null;
let finished = false;

function finish(ok: boolean, message: string) {
  if (finished) return;
  finished = true;
  console.log(ok ? `[e2e] PASS: ${message}` : `[e2e] FAIL: ${message}`);
  socket.disconnect();
  process.exit(ok ? 0 : 1);
}

socket.on("connect", async () => {
  console.log(`[e2e] socket connected ${socket.id}`);

  try {
    const response = await fetch(`${API_URL}/api/trades/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: LIMIT }),
    });
    const body = (await response.json()) as { jobId?: string };
    pullJobId = body.jobId ?? null;
    console.log(`[e2e] manual pull queued jobId=${pullJobId} limit=${LIMIT}`);
  } catch (error) {
    finish(false, `pull request failed: ${String(error)}`);
  }
});

socket.on("trade:created", (trade) => {
  received.push(trade);
  console.log(`[e2e] trade:created ${trade.tradeId} (${received.length}/${LIMIT})`);

  if (received.length === LIMIT) {
    const ids = received.map((t) => t.tradeId);
    const allMock = ids.every((id) => /^BSE-MOCK-\d{6}$/u.test(id));
    const unique = new Set(ids).size === ids.length;
    if (!allMock || !unique) {
      finish(false, `unexpected trade ids: ${ids.join(", ")}`);
      return;
    }
    finish(
      true,
      `all ${LIMIT} newly inserted trades arrived via Socket.IO without refresh: ${ids.join(", ")}`,
    );
  }
});

socket.on("connect_error", (error) => {
  finish(false, `socket connection error: ${error.message}`);
});

setTimeout(() => {
  finish(
    false,
    `timeout: only ${received.length}/${LIMIT} trade:created events received (jobId=${pullJobId})`,
  );
}, EVENT_BUDGET_MS);
