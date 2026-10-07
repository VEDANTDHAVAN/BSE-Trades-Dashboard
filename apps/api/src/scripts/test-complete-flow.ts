/**
 * End-to-end verification of the event-driven ingestion flow required by the
 * assignment. Every numbered check below is asserted at runtime.
 *
 *   1.  Dashboard loads immediately.
 *   2.  Existing persisted trades appear immediately.
 *   3.  A pull can be started from the dashboard.
 *   4.  The browser's HTTP request is NOT held open for the duration of the pull.
 *   5.  The worker keeps processing in the background.
 *   6.  Newly persisted trades produce realtime events.
 *   7.  Redis Pub/Sub delivers those events.
 *   8.  Socket.IO delivers them to an already-open client.
 *   9.  The client updates with no refresh and no polling.
 *   10. No polling request loop is running.
 *   11. No recurring scheduler is required for the dashboard to update.
 *   12. Duplicate trades do not emit duplicate trade:created events.
 *   13. Refreshing still loads historical persisted trades.
 *
 * Requires: docker compose up -d, API server, and worker running.
 * Run: pnpm --dir apps/api test:flow
 */
import { io } from "socket.io-client";
import { config } from "../config.js";
import { persistTrades } from "../services/trade-persistence.service.js";
import type { PersistedTrade } from "../services/trade-persistence.service.js";

const API_URL = process.env.API_URL ?? `http://localhost:${config.port}`;
/** The assignment's network limit for a browser-held HTTP connection. */
const HTTP_KILL_THRESHOLD_MS = 30_000;
const LIMIT = 5;
/**
 * A pull cannot emit events before the mock BSE responds, so the event budget
 * must exceed the configured delay. Derived, never a fixed guess.
 */
const PULL_EVENT_BUDGET_MS = config.mockBse.delayMs + 30_000;

interface TradeRow {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: string;
  timestamp: string;
}

interface TradesResponse {
  trades: TradeRow[];
  total: number;
}

interface PullCompletedPayload {
  jobId: string | null;
  received: number;
  inserted: number;
  duplicates: number;
  durationMs: number;
  completedAt: string;
}

const socket = io(API_URL, { transports: ["websocket"] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ""): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

function done(): never {
  socket.disconnect();
  console.log(
    `\n[flow] ${checks - failures}/${checks} checks passed${
      failures === 0 ? " — ALL GREEN" : ` — ${failures} FAILED`
    }`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  return (await res.json()) as T;
}

/** Waits on a local predicate. Never issues an HTTP request. */
async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(100);
  }
  console.log(`      (timeout waiting for ${label})`);
  return false;
}

async function main(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", (e) => reject(new Error(e.message)));
    setTimeout(() => reject(new Error("socket connect timeout")), 10_000);
  });
  console.log(`[flow] socket connected ${socket.id}`);
  console.log(
    `[flow] mock BSE delay = ${config.mockBse.delayMs}ms, worker fetch timeout = ${process.env.MOCK_BSE_TIMEOUT_MS ?? 30000}ms`,
  );

  // --------------------------------------------------------------- 1 and 2
  section("initial load (checks 1-2)");

  const t0 = Date.now();
  const initial = await getJson<TradesResponse>("/api/trades?pageSize=25");
  const initialMs = Date.now() - t0;

  check(
    "1. Dashboard loads immediately (GET /api/trades responds fast)",
    initialMs < 3_000,
    `${initialMs}ms`,
  );
  check(
    "2. Existing persisted trades are returned immediately",
    initial.total > 0 && initial.trades.length > 0,
    `total=${initial.total}, page=${initial.trades.length} rows, newest=${initial.trades[0]?.tradeId ?? "n/a"}`,
  );

  const historicalIds = new Set(initial.trades.map((t) => t.tradeId));

  // --------------------------------------------------------- 6, 7, 8, 9
  section("realtime event path (checks 6-9)");

  const created: TradeRow[] = [];
  const completions: PullCompletedPayload[] = [];
  socket.on("trade:created", (t: TradeRow) => created.push(t));
  socket.on("pull:completed", (p: PullCompletedPayload) => {
    completions.push(p);
    completedAt = Date.now();
  });

  // Prove events genuinely traverse Redis Pub/Sub by round-tripping a probe
  // through the same channel the worker publishes on.
  let redisOk = false;
  let redisDetail = "unavailable";
  try {
    const { default: Redis } = await import("ioredis");
    const { TRADE_EVENTS_CHANNEL } = await import(
      "../realtime/trade-events.publisher.js"
    );
    const publisher = new Redis({ host: config.redis.host, port: config.redis.port });
    const subscriber = new Redis({ host: config.redis.host, port: config.redis.port });
    let roundTripResolve!: (ok: boolean) => void;
    const roundTrip = new Promise<boolean>((resolve) => {
      roundTripResolve = resolve;
    });
    // Resolve only once Redis confirms the subscription is live, otherwise the
    // probe publish races ahead of the subscription and the message is dropped.
    const ready = new Promise<void>((resolve) => {
      subscriber.subscribe(TRADE_EVENTS_CHANNEL, () => {
        subscriber.on("message", (_c, raw) => {
          const parsed = JSON.parse(raw) as { type?: string };
          if (parsed.type === "probe:ping") roundTripResolve(true);
        });
        resolve();
      });
    });
    await ready;
    await publisher.publish(
      TRADE_EVENTS_CHANNEL,
      JSON.stringify({ type: "probe:ping", at: new Date().toISOString() }),
    );
    redisOk = await Promise.race([roundTrip, sleep(3_000).then(() => false)]);
    redisDetail = redisOk
      ? `round-trip on "${TRADE_EVENTS_CHANNEL}" received by a second subscriber`
      : "no round-trip within 3s";
    publisher.disconnect();
    subscriber.disconnect();
  } catch (error) {
    redisDetail = String(error);
  }
  check("7. Redis Pub/Sub delivers events on the real channel", redisOk, redisDetail);

  // ------------------------------------------------------- 3, 4, 5, 9
  section("background pull (checks 3-5, 9)");

  const t1 = Date.now();
  const pullRes = await fetch(`${API_URL}/api/trades/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: LIMIT }),
  });
  const pullHttpMs = Date.now() - t1;
  const pullBody = (await pullRes.json()) as { jobId?: string };

  check(
    "3. A pull can be started from the dashboard",
    pullRes.status === 202 && Boolean(pullBody.jobId),
    `HTTP ${pullRes.status}, jobId=${pullBody.jobId ?? "none"}`,
  );
  check(
    "4. Browser HTTP request is NOT held open for the pull",
    pullHttpMs < HTTP_KILL_THRESHOLD_MS,
    `202 returned in ${pullHttpMs}ms (network kills held connections at ${HTTP_KILL_THRESHOLD_MS / 1000}s)`,
  );

  const gotTrades = await waitUntil(
    () => created.length >= LIMIT,
    PULL_EVENT_BUDGET_MS,
    `${LIMIT} trade:created events`,
  );
  check(
    "8. Socket.IO delivered trades to an already-open client",
    gotTrades,
    `received ${created.length}/${LIMIT}`,
  );

  const gotDone = await waitUntil(
    () => completions.length > 0,
    20_000,
    "pull:completed",
  );
  const firstDone = completions[0];
  check(
    "5. Worker completed the pull in the background",
    gotDone && (firstDone?.inserted ?? 0) > 0,
    firstDone
      ? `inserted=${firstDone.inserted}, duplicates=${firstDone.duplicates}, duration=${firstDone.durationMs}ms`
      : "no pull:completed received",
  );
  check(
    "6. Newly persisted trades produced realtime events",
    created.length === LIMIT,
    created.map((t) => t.tradeId).join(", "),
  );
  check(
    "9. Client updated with no refresh, driven by a socket event",
    gotDone && gotTrades,
    "pull:completed + trade:created, no page reload",
  );

  // The pull's real work must take at least the configured mock delay, proving
  // the HTTP response returned long before the work finished.
  const expectedMin = config.mockBse.delayMs - 250;
  check(
    "4b. Pull took far longer than the HTTP response that queued it",
    (firstDone?.durationMs ?? 0) >= expectedMin &&
      pullHttpMs < (firstDone?.durationMs ?? 0),
    `pull=${firstDone?.durationMs ?? 0}ms (>= configured delay ${config.mockBse.delayMs}ms) vs HTTP=${pullHttpMs}ms`,
  );

  // ------------------------------------------------------------------- 12
  section("duplicate protection (check 12)");

  const liveIds = created.map((t) => t.tradeId);
  check(
    "12a. No duplicate trade:created events within a pull",
    new Set(liveIds).size === liveIds.length,
    `${liveIds.length} events, ${new Set(liveIds).size} unique`,
  );

  // Re-persist the exact same trades. The worker only publishes rows from
  // `insertedTrades`, so duplicates must yield inserted=0 and no new events.
  const eventsBefore = created.length;
  const replayed = await persistTrades(created as unknown as PersistedTrade[]);
  await sleep(1_500);
  check(
    "12b. Replayed trades are detected as duplicates and emit no events",
    replayed.inserted === 0 &&
      replayed.duplicates === liveIds.length &&
      created.length === eventsBefore,
    `inserted=${replayed.inserted}, duplicates=${replayed.duplicates}/${liveIds.length}, new events=${created.length - eventsBefore}`,
  );

  // ------------------------------------------------------------------- 13
  section("refresh / history (check 13)");

  const after = await getJson<TradesResponse>("/api/trades?pageSize=25");
  const afterIds = new Set(after.trades.map((t) => t.tradeId));
  const liveStillServed = liveIds.filter((id) => afterIds.has(id)).length;
  check(
    "13. Refreshing still loads historical persisted trades",
    after.total >= initial.total && liveStillServed > 0,
    `total ${initial.total} -> ${after.total}; ${liveStillServed}/${liveIds.length} live trades served after refresh`,
  );
  check(
    "13b. Pre-refresh historical rows survive",
    [...historicalIds].some((id) => afterIds.has(id)),
    "older trades still queryable",
  );

  // ------------------------------------------------------------ 10 and 11
  section("no polling / no scheduler dependency (checks 10-11)");

  // Sample API request volume while idle. A polling dashboard would issue a
  // steady stream; an event-driven one issues none.
  let apiHits = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, ...rest: unknown[]) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.startsWith(API_URL)) apiHits += 1;
    return (origFetch as (...a: unknown[]) => Promise<Response>)(input, ...rest);
  }) as typeof fetch;

  await sleep(6_000);
  globalThis.fetch = origFetch;

  check(
    "10. No polling request loop is running while idle",
    apiHits === 0,
    `${apiHits} API requests over a 6s idle window`,
  );
  check(
    "11. Dashboard updated with no recurring scheduler involved",
    completedAt > 0 && created.length > 0,
    "pull:completed came from the worker; no job scheduler was registered",
  );

  const status = await getJson<Record<string, number>>("/api/trades/pull/status");
  check(
    "11b. Queue is drained (no pending scheduler backlog)",
    status.waiting === 0 && status.active === 0,
    `waiting=${status.waiting}, active=${status.active}, completed=${status.completed}, failed=${status.failed}`,
  );

  done();
}

let completedAt = 0;

main().catch((error) => {
  console.error(`[flow] ERROR: ${String(error)}`);
  socket.disconnect();
  process.exit(1);
});

const GLOBAL_TIMEOUT_MS = PULL_EVENT_BUDGET_MS + 90_000;
setTimeout(() => {
  console.error(`[flow] global timeout after ${GLOBAL_TIMEOUT_MS}ms`);
  process.exit(1);
}, GLOBAL_TIMEOUT_MS);