import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchPullStatus,
  fetchSymbols,
  requestTradePull,
  type PullCompletedPayload,
  type PullStatus,
} from "./lib/api";
import { useSocket } from "./hooks/useSockets";
import { useTrades } from "./hooks/useTrades";
import "./App.css";

const PAGE_SIZES = [10, 25, 50, 100] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`status-pill ${connected ? "status-pill--live" : "status-pill--down"}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-pill__dot" aria-hidden="true" />
      {connected ? "Live" : "Reconnecting…"}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card ${accent ? "stat-card--accent" : ""}`}>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      {hint ? <span className="stat-card__hint">{hint}</span> : null}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [symbol, setSymbol] = useState("");
  const [client, setClient] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);

  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<PullStatus | null>(null);
  const triggeredJobId = useRef<string | null>(null);

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      symbol: symbol || undefined,
      client: client || undefined,
    }),
    [page, pageSize, symbol, client],
  );

  const trades = useTrades(filters);
  const { handleTradeCreated, handlePullCompleted } = trades;

  const refreshQueueStatus = useCallback(async () => {
    try {
      setQueueStatus(await fetchPullStatus());
    } catch {
      // Queue status is best-effort; a failure here must not break the UI.
    }
  }, []);

  // Load symbols + queue status once on mount. No timers — everything after
  // this is driven by Socket.IO events.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await fetchSymbols();
        if (active) setSymbols(list);
      } catch {
        // Symbol list is optional; the dashboard still works without it.
      }
      try {
        const status = await fetchPullStatus();
        if (active) setQueueStatus(status);
      } catch {
        // Queue status is best-effort; a failure here must not break the UI.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onPullCompleted = useCallback(
    (payload: PullCompletedPayload) => {
      handlePullCompleted(payload);
      void refreshQueueStatus();
      setPulling(false);
    },
    [handlePullCompleted, refreshQueueStatus],
  );

  const { connected } = useSocket(handleTradeCreated, onPullCompleted);

  const handlePull = useCallback(async () => {
    setPulling(true);
    setPullError(null);
    try {
      const res = await requestTradePull(50);
      triggeredJobId.current = res.jobId;
    } catch (error) {
      setPulling(false);
      setPullError(error instanceof Error ? error.message : "Pull failed");
    }
  }, []);

  const resetFilters = useCallback(() => {
    setPage(1);
    setSymbol("");
    setClient("");
  }, []);

  const changePage = useCallback((next: number) => {
    setPage(Math.max(1, next));
  }, []);

  const changePageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const {
    trades: rows,
    total,
    totalPages,
    loading,
    error,
    summary,
    liveCount,
    lastPull,
    liveTradeIds,
  } = trades;

  const totals = summary?.totals;
  const symbolCount = summary?.symbols.length ?? 0;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
              <path
                d="M4 17l5-6 4 3 6-8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 6h5v5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="app__brand-text">
            <h1 className="app__title">BSE Trades</h1>
            <p className="app__subtitle">Realtime market dashboard</p>
          </div>
        </div>

        <div className="app__header-actions">
          <ConnectionPill connected={connected} />
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePull}
            disabled={pulling}
          >
            {pulling ? (
              <>
                <span className="spinner" aria-hidden="true" /> Pulling…
              </>
            ) : (
              "Pull trades"
            )}
          </button>
        </div>
      </header>

      {!connected && (
        <div className="banner banner--warn" role="alert">
          Realtime connection lost. Trades will resume automatically when the
          connection is restored — no refresh needed.
        </div>
      )}

      {pulling && (
        <div className="banner banner--info" role="status">
          <span className="spinner" aria-hidden="true" />
          Pull in progress. New trades appear below automatically as they are
          persisted — the request is running in the background.
        </div>
      )}

      {pullError && (
        <div className="banner banner--error" role="alert">
          {pullError}
        </div>
      )}

      <main className="app__main">
        <section className="stats" aria-label="Trade statistics">
          <StatCard
            label="Total trades"
            value={totals ? formatQuantity(totals.totalTrades) : "—"}
            hint={totals ? `across ${symbolCount} symbols` : "loading…"}
          />
          <StatCard
            label="Turnover"
            value={totals ? formatCurrency(Number(totals.totalValue)) : "—"}
            hint="Σ quantity × price"
          />
          <StatCard
            label="Last pull"
            value={lastPull ? `${formatQuantity(lastPull.inserted)} new` : "—"}
            hint={
              lastPull
                ? `${formatQuantity(lastPull.duplicates)} dup · ${Math.round(
                    lastPull.durationMs / 1000,
                  )}s`
                : "no pull yet"
            }
          />
          <StatCard
            label="Live this session"
            value={formatQuantity(liveCount)}
            hint="received via socket"
            accent
          />
        </section>

        <section className="panel" aria-label="Trades">
          <div className="panel__toolbar">
            <div className="filters">
              <label className="field">
                <span className="field__label">Symbol</span>
                <select
                  className="field__control"
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All symbols</option>
                  {symbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Client</span>
                <input
                  className="field__control"
                  type="text"
                  placeholder="e.g. CLIENT-0023"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    setPage(1);
                  }}
                />
              </label>

              {(symbol || client) && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={resetFilters}
                >
                  Reset
                </button>
              )}
            </div>

            <div className="toolbar-right">
              <label className="field field--inline">
                <span className="field__label">Rows</span>
                <select
                  className="field__control"
                  value={pageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error ? (
            <div className="state state--error" role="alert">
              <p className="state__title">Couldn’t load trades</p>
              <p className="state__detail">{error}</p>
            </div>
          ) : loading ? (
            <div className="state state--loading" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Loading trades…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="state state--empty">
              <p className="state__title">No trades yet</p>
              <p className="state__detail">
                {symbol || client
                  ? "No trades match the current filters."
                  : "Trigger a pull to start ingesting trades."}
              </p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="trades">
                  <thead>
                    <tr>
                      <th scope="col">Trade ID</th>
                      <th scope="col">Symbol</th>
                      <th scope="col">Client</th>
                      <th scope="col" className="num">
                        Quantity
                      </th>
                      <th scope="col" className="num">
                        Price
                      </th>
                      <th scope="col" className="num">
                        Value
                      </th>
                      <th scope="col" className="num">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isNew = liveTradeIds.has(row.tradeId);
                      return (
                        <tr
                          key={row.tradeId}
                          className={
                            isNew ? "trade-row trade-row--new" : "trade-row"
                          }
                        >
                          <td className="mono muted">{row.tradeId}</td>
                          <td className="symbol">{row.symbol}</td>
                          <td className="muted">{row.client}</td>
                          <td className="num">{formatQuantity(row.quantity)}</td>
                          <td className="num">
                            {formatCurrency(Number(row.price))}
                          </td>
                          <td className="num">
                            {formatCurrency(Number(row.price) * row.quantity)}
                          </td>
                          <td className="num time">
                            <span className="time__relative">
                              {relativeTime(row.timestamp)}
                            </span>
                            <span className="time__absolute mono">
                              {clockTime(row.timestamp)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span className="pagination__info">
                  Showing {rows.length} of {formatQuantity(total)} trades
                </span>
                <div className="pagination__controls">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => changePage(page - 1)}
                    disabled={page <= 1}
                  >
                    Prev
                  </button>
                  <span className="pagination__page">
                    Page {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => changePage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {queueStatus && (
          <footer className="app__footer">
            <span>
              Queue: {queueStatus.active} active · {queueStatus.waiting} waiting
              · {queueStatus.completed} completed · {queueStatus.failed} failed
            </span>
            <span className="muted">
              Updates are event-driven via Redis Pub/Sub → Socket.IO. No polling.
            </span>
          </footer>
        )}
      </main>
    </div>
  );
}
