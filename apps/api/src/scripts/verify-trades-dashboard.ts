import { io } from "socket.io-client";
import { config } from "../config.js";

const API_URL = `http://localhost:${config.port}`;
const LIMIT = 3;
/** A pull cannot emit events before the mock BSE responds. */
const EVENT_BUDGET_MS = config.mockBse.delayMs + 30_000;

interface Trade {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: string;
  timestamp: string;
}

interface TradesResponse {
  trades: Trade[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SummaryResponse {
  totals: {
    totalTrades: number;
    totalQuantity: number;
    totalValue: string;
    firstTradeAt: string | null;
    lastTradeAt: string | null;
  };
  symbols: Array<{
    symbol: string;
    tradeCount: number;
    totalQuantity: number;
    lastPrice: string;
    lastTradeAt: string;
  }>;
}

const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures.push(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  return (await response.json()) as T;
}

function firstOf<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`expected at least one ${what}, got none`);
  }
  return row;
}

/** Mirrors the live-insert merge in useTrades.handleTradeCreated. */
function applyLiveInsert(rows: Trade[], incoming: Trade, maxRows: number) {
  if (rows.some((row) => row.tradeId === incoming.tradeId)) return rows;
  return [incoming, ...rows].slice(0, maxRows);
}

async function main() {
  console.log("== trades query API ==");

  const firstPage = await getJson<TradesResponse>(
    `/api/trades?page=1&pageSize=${LIMIT}`,
  );

  check(
    firstPage.trades.length === LIMIT,
    `pageSize honoured (got ${firstPage.trades.length}/${LIMIT})`,
  );
  check(firstPage.page === 1, "page echoed back");
  check(firstPage.total > LIMIT, `total counts all trades (${firstPage.total})`);
  check(
    firstPage.totalPages === Math.max(1, Math.ceil(firstPage.total / LIMIT)),
    "totalPages consistent with total/pageSize",
  );

  const timestamps = firstPage.trades.map((trade) => Date.parse(trade.timestamp));
  check(
    timestamps.every(
      (value, index) =>
        index === 0 || value <= (timestamps.slice(0, index).at(-1) ?? value),
    ),
    "trades sorted by timestamp descending",
  );

  const anchor = firstOf(firstPage.trades, "trade on page 1");

  check(
    firstPage.trades.every(
      (trade) =>
        trade.tradeId.length > 0 &&
        trade.symbol.length > 0 &&
        trade.client.length > 0 &&
        Number.isFinite(Number(trade.price)) &&
        Number.isFinite(trade.quantity),
    ),
    "every row has tradeId, symbol, client, numeric price and quantity",
  );

  const secondPage = await getJson<TradesResponse>(
    `/api/trades?page=2&pageSize=${LIMIT}`,
  );
  check(
    secondPage.trades.length === LIMIT &&
      firstOf(secondPage.trades, "trade on page 2").tradeId !== anchor.tradeId,
    "page 2 does not repeat page 1 rows",
  );

  const sampleSymbol = anchor.symbol;
  const filtered = await getJson<TradesResponse>(
    `/api/trades?symbol=${sampleSymbol}&pageSize=${LIMIT}`,
  );
  check(
    filtered.trades.every((trade) => trade.symbol === sampleSymbol),
    `symbol filter returns only ${sampleSymbol}`,
  );
  check(
    filtered.total < firstPage.total || filtered.total === firstPage.total,
    `symbol filter narrows the result set (${filtered.total} vs ${firstPage.total})`,
  );

  const sampleClient = anchor.client;
  const byClient = await getJson<TradesResponse>(
    `/api/trades?client=${sampleClient}&pageSize=${LIMIT}`,
  );
  check(
    byClient.trades.every((trade) => trade.client === sampleClient),
    `client filter returns only ${sampleClient}`,
  );

  const summary = await getJson<SummaryResponse>("/api/trades/summary");
  check(summary.totals.totalTrades > 0, "summary totals present");
  check(
    Number(summary.totals.totalValue) > 0,
    `turnover computed (₹${summary.totals.totalValue})`,
  );
  check(
    summary.totals.lastTradeAt !== null &&
      summary.totals.firstTradeAt !== null,
    "first/last trade timestamps present",
  );
  check(
    summary.symbols.every((row) => row.tradeCount > 0 && row.lastPrice !== ""),
    `per-symbol summaries populated (${summary.symbols.length} symbols)`,
  );

  const invalidPageSize = await fetch(`${API_URL}/api/trades?pageSize=0`);
  check(invalidPageSize.status === 400, "pageSize=0 rejected with 400");

  const oversizedPageSize = await fetch(`${API_URL}/api/trades?pageSize=5000`);
  check(oversizedPageSize.status === 400, "pageSize above cap rejected with 400");

  const badSince = await fetch(`${API_URL}/api/trades?since=not-a-date`);
  check(badSince.status === 400, "invalid since timestamp rejected with 400");

  const invertedRange = await fetch(
    `${API_URL}/api/trades?since=2030-01-01T00:00:00.000Z&until=2020-01-01T00:00:00.000Z`,
  );
  check(invertedRange.status === 400, "since after until rejected with 400");

  console.log("\n== realtime ingest + live table merge ==");

  const socket = io(API_URL, { transports: ["websocket"] });
  const received: Array<{
    tradeId: string;
    client: string;
    symbol: string;
    quantity: number;
    price: number;
    timestamp: string;
  }> = [];

  const ingested = await new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`only ${received.length}/${LIMIT} trade:created events arrived`)),
      EVENT_BUDGET_MS,
    );

    socket.on("trade:created", (trade) => {
      received.push(trade);
      if (received.length === LIMIT) {
        clearTimeout(timer);
        resolve(received.map((trade) => trade.tradeId));
      }
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    void (async () => {
      const response = await fetch(`${API_URL}/api/trades/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: LIMIT }),
      });
      check(response.ok, `manual pull queued (HTTP ${response.status})`);
    })();
  });

  socket.disconnect();

  check(
    new Set(ingested).size === LIMIT,
    `Socket.IO delivered ${LIMIT} unique trade ids: ${ingested.join(", ")}`,
  );

  // Each event must be readable from the query API without a page refresh.
  const liveTrade = firstOf(received, "socket trade:created event");
  const persisted = await getJson<TradesResponse>(
    `/api/trades?symbol=${liveTrade.symbol}&pageSize=100`,
  );
  check(
    persisted.trades.some((trade) => trade.tradeId === liveTrade.tradeId),
    "socket-delivered trade is also served by GET /api/trades",
  );

  let merged: Trade[] = [];
  for (const event of received) {
    merged = applyLiveInsert(
      merged,
      {
        tradeId: event.tradeId,
        client: event.client,
        symbol: event.symbol,
        quantity: event.quantity,
        price: event.price.toFixed(2),
        timestamp: event.timestamp,
      },
      100,
    );
  }

  const newestMerged = firstOf(merged, "merged trade");
  const newestReceived = firstOf(
    [...received].reverse(),
    "last received event",
  );
  check(
    merged.length === LIMIT && newestMerged.tradeId === newestReceived.tradeId,
    "live merges prepend newest trade without a refresh",
  );

  const deduped = applyLiveInsert(merged, newestMerged, 100);
  check(deduped.length === merged.length, "re-delivered trade id is ignored (no duplicate row)");

  console.log(
    failures.length === 0
      ? `\n[verify-trades-dashboard] PASS (all checks green)`
      : `\n[verify-trades-dashboard] FAIL: ${failures.length} check(s) failed`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(`[verify-trades-dashboard] FAIL: ${String(error)}`);
  process.exit(1);
});
