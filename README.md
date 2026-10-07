# BSE Trades Dashboard

Real-time trade ingestion dashboard. A Mock BSE feed produces trades, a BullMQ worker pulls
and persists them into PostgreSQL, and each new trade is published over Redis Pub/Sub and
streamed to the browser via Socket.IO.

**Why this shape:** a full BSE pull takes up to 15 minutes, but our network kills any HTTP
connection held open longer than 30 seconds. So the browser never waits for a pull — it
triggers one (`POST /api/trades/pull` → `202` in milliseconds), the worker does the slow
work in the background, and the result is *pushed* to the already-open dashboard over
Socket.IO. No page refresh, no polling loop, no cron. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the full diagram and rationale.

```
Browser ──POST /pull (202 in ~20ms)──▶ API ──enqueue──▶ BullMQ (Redis)
   ▲                                                          │
   │                                                          ▼
   │  Socket.IO: trade:created / pull:completed        Worker (background)
   │        ▲                                            1. GET /mock-bse/getTrades (≤15 min)
   └────────┴── API subscriber ◀── Redis Pub/Sub ◀────── 2. persist → PostgreSQL (dedup)
                                                      3. publish events
```

## Stack

| Layer     | Tech                                    |
| --------- | --------------------------------------- |
| Ingest    | Express 5, Mock BSE trade generator     |
| Queue     | BullMQ 6 + Redis 7 (ioredis)            |
| Storage   | PostgreSQL 17 + Prisma 7                |
| Realtime  | Redis Pub/Sub → Socket.IO 4             |
| Dashboard | React 19 + Vite 8 + socket.io-client    |

Monorepo managed with pnpm workspaces: `apps/api` (Express/worker), `apps/web` (React).

## Getting started

Requires: Node 20+, pnpm 9+, Docker.

### 1. Infrastructure

```bash
docker compose up -d
```

Starts `bse-trades-postgres` (5432) and `bse-trades-redis` (6379), both with named volumes.

### 2. API

```bash
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm --dir apps/api exec prisma migrate dev   # create/apply schema
pnpm --dir apps/api seed                       # optional seed data
```

### 3. Run

Three processes are needed for the full pipeline (one terminal each):

```bash
pnpm --dir apps/api dev      # Express API + Socket.IO + Mock BSE feed (port 4000)
pnpm --dir apps/api worker   # BullMQ worker that pulls and persists trades
pnpm --dir apps/web dev      # React dashboard (Vite dev server, port 5173)
```

Open http://localhost:5173. The dashboard loads instantly with all previously persisted
trades. Click **Pull trades** to start a background pull; new trades appear in the table
live as the worker persists them, and a completion banner shows the result.

> **The scheduler is optional and not required by the dashboard.** A recurring pull
> scheduler exists as an independent feature (`pnpm --dir apps/api schedule`, interval from
> `TRADE_PULL_INTERVAL_MS`, default 15 min). The dashboard's realtime updates come from the
> worker's completion events, so it works identically with the scheduler stopped.

## Environment variables (`apps/api/.env`)

| Variable                | Default        | Description                                                                 |
| ----------------------- | -------------- | --------------------------------------------------------------------------- |
| `PORT`                  | `4000`         | API + Socket.IO port                                                        |
| `DATABASE_URL`          | —              | PostgreSQL connection string (required)                                     |
| `REDIS_HOST`            | `localhost`    | Redis host                                                                  |
| `REDIS_PORT`            | `6379`         | Redis port                                                                  |
| `MOCK_BSE_DELAY_MS`     | `1000`         | Simulated BSE response time. `0`–`900000` (up to the 15-minute worst case)  |
| `MOCK_BSE_TIMEOUT_MS`   | `960000`       | Worker-side timeout for the mock BSE request. Must be ≥ `MOCK_BSE_DELAY_MS` |
| `TRADE_PULL_INTERVAL_MS`| `900000`       | Interval for the *optional* recurring scheduler                             |

`MOCK_BSE_TIMEOUT_MS` defaults to 16 minutes so a maximum-length pull never aborts. This is
the worker's own server-to-server connection — the 30-second network limit applies to the
browser's connections, which are all short-lived by design.

## API

| Method | Path                       | Description                                  |
| ------ | -------------------------- | -------------------------------------------- |
| GET    | `/health`                  | API + database health                        |
| GET    | `/mock-bse/getTrades`      | Mock BSE feed (`?limit=N`)                   |
| POST   | `/api/trades/pull`         | Queue an on-demand pull (HTTP 202)          |
| GET    | `/api/trades/pull/status`  | Queue counts and recent jobs                |
| GET    | `/api/trades`              | Paginated trades (see below)                 |
| GET    | `/api/trades/summary`      | Aggregate totals and per-symbol breakdown    |
| GET    | `/api/trades/symbols`      | Symbol list for filter dropdowns             |

### Socket.IO events (server → client)

| Event             | Payload                                                        | When                          |
| ----------------- | -------------------------------------------------------------- | ----------------------------- |
| `trade:created`   | `{ tradeId, client, symbol, quantity, price, timestamp }`      | Each newly persisted trade    |
| `pull:completed`  | `{ jobId, received, inserted, duplicates, durationMs, completedAt }` | Each finished pull job    |

### `GET /api/trades` query parameters

| Param    | Type    | Notes                                                |
| -------- | ------- | ---------------------------------------------------- |
| `page`     | number  | 1-based page number                                   |
| `pageSize` | number  | 1–100, default 25; out-of-range returns 400           |
| `symbol`   | string  | Exact symbol match, case-insensitive                  |
| `client`   | string  | Exact client code match, case-insensitive             |
| `since`    | ISO 8601 | Lower timestamp bound (inclusive)                    |
| `until`    | ISO 8601 | Upper timestamp bound (inclusive); must be ≥ `since` |

Response:

```json
{
  "trades": [ { "tradeId": "BSE-MOCK-000701", "symbol": "SBIN", "client": "CLIENT-0031",
                "price": "15320.40", "quantity": 240, "timestamp": "2026-10-06T18:12:00.000Z" } ],
  "page": 1,
  "pageSize": 25,
  "total": 3701,
  "totalPages": 149
}
```

`price` is a decimal string, not a JSON number, to avoid float rounding on the client.

### `GET /api/trades/summary`

```json
{
  "totals": {
    "totalTrades": 3701,
    "totalQuantity": 1482300,
    "totalValue": "84199438952.60",
    "firstTradeAt": "2026-10-06T17:00:00.000Z",
    "lastTradeAt": "2026-10-06T18:12:00.000Z"
  },
  "symbols": [
    { "symbol": "AXISBANK", "tradeCount": 240, "totalQuantity": 96000,
      "lastPrice": "15301.20", "lastTradeAt": "2026-10-06T18:11:00.000Z" }
  ]
}
```

Totals are computed in SQL (`SUM(quantity * price)`), so the turnover figure stays exact
regardless of row count.

## Testing

All commands run from `apps/api` unless noted. The e2e scripts need the API server and
worker running (plus Docker).

| Script                     | What it verifies                                              |
| -------------------------- | ------------------------------------------------------------- |
| `test:redis`               | Redis connectivity (PONG)                                     |
| `test:queue`               | BullMQ job enqueue                                            |
| `test:mock-bse`            | Mock BSE feed returns well-formed trades                      |
| `test:trade-persistence`   | Insert path and duplicate protection (`inserted` / `duplicates`) |
| `test:trade-event`         | Redis Pub/Sub publisher emits an event                        |
| `test:socket`              | Socket.IO client receives a published event                   |
| `test:realtime-e2e`        | Full chain: pull → persist → Redis → Socket.IO                |
| `test:flow`                | **13-check end-to-end audit** of the assignment requirements (see below) |
| `verify:dashboard`         | Trades query API, filters, pagination, summary, live merge     |
| `typecheck`                | `tsc --noEmit`                                                |
| `build`                    | `tsc`                                                        |

Web app: `pnpm --dir apps/web build` (typecheck + Vite bundle), `pnpm --dir apps/web lint`.

### The 13-check flow test

`pnpm --dir apps/api test:flow` asserts, at runtime, that:

1. the dashboard loads immediately, 2. persisted trades appear immediately, 3. a pull can be
   started, 4. the browser's HTTP request is **not** held open for the pull (202 in
   milliseconds while the pull runs for the full mock delay), 5. the worker finishes in the
   background, 6. new trades produce realtime events, 7. Redis Pub/Sub delivers events on
   the real channel, 8. Socket.IO delivers them to an already-open client, 9. the client
   updates with no refresh, 10. **no polling requests occur while idle**, 11. **no
   recurring scheduler is involved**, 12. duplicate trades emit no duplicate events, 13.
   refreshing still loads historical trades.

To demonstrate the 30-second constraint explicitly, set `MOCK_BSE_DELAY_MS=35000`
(> 30 s) and `MOCK_BSE_TIMEOUT_MS=60000` in `apps/api/.env`, restart the API and worker,
and run `test:flow` — check 4 then proves the browser's request returned in milliseconds
while the pull ran for 35 seconds.

## Demo / video walkthrough

Suggested script (~3 minutes):

1. **Setup (10 s)** — show `docker compose up -d`, the three run commands, and the
   dashboard opening instantly with historical trades already in the table.
2. **Live pull (60 s)** — set `MOCK_BSE_DELAY_MS=35000` (a pull longer than the 30-second
   network limit). Click **Pull trades**. Show:
   - the button switches to *Pulling…* and the banner explains the pull is running in the
     background;
   - open DevTools → Network: the `POST /api/trades/pull` request completes in
     milliseconds (202) — nothing is held open;
   - after ~35 s the trades flash into the table and the completion banner shows
     inserted/duplicate counts — no refresh, no polling requests in the Network tab.
3. **No polling (20 s)** — leave the dashboard idle with DevTools open; the Network tab
   stays empty (only the WebSocket is active).
4. **Filters + pagination (30 s)** — filter by symbol, change page size, paginate.
5. **Refresh (15 s)** — reload the page; all trades (including the just-pulled ones) are
   back from PostgreSQL.
6. **Close (10 s)** — mention the optional scheduler and point to ARCHITECTURE.md.

## Mock BSE trade IDs and restarts

Mock trades use sequential IDs (`BSE-MOCK-000001`, `BSE-MOCK-000002`, …) generated from a
module-level counter. A plain counter resets to zero on every API restart, so after a restart
the feed would re-issue IDs already stored in PostgreSQL and every pull would report
`inserted=0, duplicates=N`.

The pull route therefore seeds the counter from the highest `BSE-MOCK-*` ID currently in the
database (`seedMockTradeSequence()` in `apps/api/src/mock-bse/mock-bse.routes.ts`, applied via
`setMockTradeSequence()` in `trade-generator.ts`) before generating trades. This keeps the
sequential ID format while guaranteeing uniqueness across restarts. Real duplicate protection
(`findMany` + `skipDuplicates` in `trade-persistence.service.ts`) is unchanged and still guards
against genuine repeats.

## Layout

```
apps/api/src
├── app.ts                     Express app assembly
├── server.ts                  HTTP + Socket.IO bootstrap
├── config.ts                  Env config
├── clients/                   Prisma + Redis clients, mock BSE client
├── mock-bse/                  Mock feed: generator + routes
├── queues/                    BullMQ queue definition
├── workers/                   BullMQ worker
├── realtime/                  Redis Pub/Sub → Socket.IO bridge
├── routes/                    health, trade-pull, trades
├── services/                  persistence, trade query
├── schedulers/                Optional interval-based pull
└── scripts/                   Verification scripts (tsx)

apps/web/src
├── App.tsx                    Dashboard
├── hooks/useTrades.ts         Table state + live socket merge
├── hooks/useSockets.ts        Socket connection lifecycle
└── lib/api.ts                 HTTP client
```
