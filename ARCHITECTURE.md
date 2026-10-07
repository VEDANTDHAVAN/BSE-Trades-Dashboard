# Architecture

## The constraint

We pull trade data from the BSE Exchange API. A full pull takes **up to 15 minutes**, but
our network kills any HTTP connection held open for **longer than 30 seconds**.

A naive design — browser calls the API, the API calls BSE and waits, then responds — fails
in two places:

1. The browser's request would be held open for up to 15 minutes and the network would
   sever it at 30 seconds.
2. Even if it survived, the user would stare at a spinner for 15 minutes with no feedback.

## The design

The long-running BSE request is **decoupled from the browser's HTTP connection**. The
browser only ever makes short requests; the slow work happens in a background worker; the
result is pushed to the browser over a persistent WebSocket.

```
┌────────────┐  POST /api/trades/pull   ┌─────────────────────────────┐
│            │ ───────────────────────▶ │  API server (Express)       │
│  Browser   │  202 Accepted in ~20ms   │                             │
│  (React +  │ ◀─────────────────────── │  • queues BullMQ job        │
│  Socket.IO)│                          │  • serves GET /api/trades   │
└─────┬──────┘                          │  • Socket.IO server         │
      │                                 └──────────────┬──────────────┘
      │  WebSocket (persistent, no per-request timeout)│
      │                                                │ enqueue
      │                                                ▼
      │                                 ┌─────────────────────────────┐
      │                                 │  BullMQ queue (Redis)       │
      │                                 └──────────────┬──────────────┘
      │                                                │ job
      │                                                ▼
      │                                 ┌─────────────────────────────┐
      │                                 │  Worker (separate process)  │
      │                                 │  1. GET /mock-bse/getTrades │
      │                                 │     (slow: up to 15 min)    │
      │                                 │  2. persist → PostgreSQL    │
      │                                 │  3. publish per new trade   │
      │                                 │  4. publish pull:completed  │
      │                                 └───────┬──────────────┬──────┘
      │                                         │              │
      │                                         ▼              ▼
      │                          ┌──────────────────┐   ┌────────────┐
      │                          │  PostgreSQL      │   │ Redis      │
      │                          │  (Prisma, unique │   │ Pub/Sub    │
      │                          │   tradeId, dedup)│   │ trade:events│
      │                          └──────────────────┘   └─────┬──────┘
      │                                                       │ subscribe
      │                                                       ▼
      │                                 ┌─────────────────────────────┐
      │  trade:created / pull:completed │  API server subscriber      │
      ◀──────────────────────────────── │  → io.emit(...) to all      │
        (Socket.IO events)              │    connected dashboards     │
                                        └─────────────────────────────┘
```

### Request lifecycle

1. **Trigger** — the dashboard calls `POST /api/trades/pull`. The API enqueues a BullMQ job
   and returns `202 Accepted` in milliseconds. The browser's HTTP connection is released
   immediately; it is never held open for the pull.
2. **Background work** — the worker (a separate process) picks up the job and calls the
   (mock) BSE API. This request can take up to 15 minutes. It is a server-to-server
   connection owned by the worker, not the browser, so the 30-second network limit does not
   apply to it. The worker's own fetch timeout (`MOCK_BSE_TIMEOUT_MS`, default 16 minutes)
   is deliberately longer than the maximum pull so a full-length pull never aborts.
3. **Persist** — trades are written to PostgreSQL. `tradeId` is unique; the persistence
   service checks existing IDs first and uses `skipDuplicates`, so a repeated trade is
   counted as a duplicate and never re-inserted.
4. **Publish** — for every *newly inserted* trade the worker publishes a `trade:created`
   event on the Redis `trade:events` channel, then one `pull:completed` event with the job
   totals. Duplicates publish nothing.
5. **Deliver** — the API server subscribes to the channel and re-emits the events over
   Socket.IO to every connected dashboard. The already-open dashboard prepends the trades
   to the table and updates its stats — no refresh, no polling.

### Why this satisfies the 30-second limit

| Connection | Owner | Max duration | Subject to 30s kill? |
| --- | --- | --- | --- |
| `POST /api/trades/pull` | Browser | ~20 ms (returns 202) | No — far under 30 s |
| `GET /api/trades`, `/summary`, … | Browser | tens of ms | No — far under 30 s |
| Socket.IO WebSocket | Browser | persistent | No — it is not an HTTP request; it is a long-lived socket that the network keeps open |
| `GET /mock-bse/getTrades` | Worker | up to 15 min | No — server-to-server, not the browser's connection |

The browser never holds an HTTP request open for the pull. It triggers the pull, then
*receives* the result over the WebSocket. That is the entire point of the architecture.

### Why no polling, no cron

- **No polling loop** — the dashboard makes no timer-driven requests. Trades arrive as
  `trade:created` socket events; stats and pull status refresh only when a `pull:completed`
  event arrives. The only HTTP requests are the initial page load and user-initiated
  filter/pagination changes.
- **No cron/scheduler dependency** — the dashboard's realtime updates come from the
  worker's completion events, not from a recurring job. A recurring scheduler
  (`pnpm --dir apps/api schedule`) exists as an *optional, independent* feature for
  continuous ingestion; the dashboard works identically with it stopped.

### Redis Pub/Sub (not a single Redis connection)

The worker and the API server are separate processes, so they cannot share in-memory state.
Redis Pub/Sub is the bridge: the worker publishes, the API server subscribes and fans out
over Socket.IO. This also means any number of dashboards (or API replicas) can subscribe
and receive the same events.

### Duplicate safety

Two layers:

1. **Persistence** — `trade-persistence.service.ts` looks up incoming `tradeId`s and only
   inserts the missing ones (`skipDuplicates`). It returns `inserted` / `duplicates` counts.
2. **Events** — the worker publishes `trade:created` only for `insertedTrades`. A duplicate
   therefore produces no event, so no dashboard ever shows a trade twice.

Mock trade IDs are sequential (`BSE-MOCK-000001`, …). Before each pull, the generator's
counter is seeded from the highest `BSE-MOCK-*` ID already in the database, so restarts
never re-issue IDs that would look like duplicates.
