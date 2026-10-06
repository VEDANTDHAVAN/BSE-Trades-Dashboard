# BSE Trades Dashboard

Real-time trade ingestion dashboard. A Mock BSE feed produces trades, a BullMQ worker
pulls and persists them into PostgreSQL, and each new trade is published over Redis Pub/Sub
and streamed to the browser via Socket.IO.

```
Mock BSE feed  ──HTTP──▶  BullMQ queue  ──▶  Worker  ──▶  PostgreSQL (Prisma)
   (Express)             (Redis)                          │
                                                         ▼
   Browser  ◀──Socket.IO──  API server  ◀──Redis Pub/Sub──  Event publisher
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

Three processes are needed for the full pipeline:

```bash
pnpm --dir apps/api dev      # Express API + Socket.IO + Mock BSE feed (port 4000)
pnpm --dir apps/api worker   # BullMQ worker that pulls and persists trades
pnpm --dir apps/web dev      # React dashboard (Vite dev server)
```

A scheduled pull is also available as a separate process via `pnpm --dir apps/api schedule`
(interval from `TRADE_PULL_INTERVAL_MS`, default 15 min). The dashboard can trigger pulls
on demand, so the scheduler is optional.

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

## Scripts

All commands run from `apps/api` unless noted.

| Script                     | What it verifies                                              |
| -------------------------- | ------------------------------------------------------------- |
| `test:redis`               | Redis connectivity (PONG)                                     |
| `test:queue`               | BullMQ job enqueue                                            |
| `test:mock-bse`            | Mock BSE feed returns well-formed trades                      |
| `test:trade-persistence`   | Insert path and duplicate protection (`inserted` / `duplicates`) |
| `test:trade-event`         | Redis Pub/Sub publisher emits an event                        |
| `test:socket`              | Socket.IO client receives a published event                   |
| `test:realtime-e2e`        | Full chain: pull → persist → Redis → Socket.IO                |
| `verify:dashboard`         | Trades query API, filters, pagination, summary, live merge     |
| `typecheck`                | `tsc --noEmit`                                                |
| `build`                    | `tsc`                                                        |

Web app: `pnpm --dir apps/web build` (typecheck + Vite bundle), `pnpm --dir apps/web lint`.

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
├── clients/                   Prisma + Redis clients
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