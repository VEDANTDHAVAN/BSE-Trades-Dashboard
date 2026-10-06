import { useCallback, useEffect, useState } from "react";

import { fetchPullStatus, requestTradePull, type PullStatus } from "./lib/api";
import { useSocket } from "./hooks/useSockets";
import { useTrades } from "./hooks/useTrades";

const PAGE_SIZE = 25;
const QUEUE_POLL_MS = 5000;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatValue(value: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-IN", { hour12: false });
}

function App() {
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState("");
  const [client, setClient] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState<PullStatus | null>(null);

  const trades = useTrades({
    page,
    pageSize: PAGE_SIZE,
    symbol: symbol || undefined,
    client: client || undefined,
  });

  const { connected } = useSocket(trades.handleTradeCreated);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadStatus = async () => {
      try {
        const status = await fetchPullStatus(controller.signal);
        if (!cancelled) setPullStatus(status);
      } catch {
        if (!cancelled) setPullStatus(null);
      }
    };

    void loadStatus();
    const timer = setInterval(() => void loadStatus(), QUEUE_POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const handlePull = useCallback(async () => {
    setPulling(true);
    setPullError(null);
    try {
      await requestTradePull(PAGE_SIZE);
    } catch (error) {
      setPullError(error instanceof Error ? error.message : "Trade pull failed");
    } finally {
      setPulling(false);
    }
  }, []);

  const totals = trades.summary?.totals;

  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>BSE Trades Dashboard</h1>
          <p className="dashboard__subtitle">
            Live Mock BSE trade feed
          </p>
        </div>

        <div className="dashboard__actions">
          <span
            className={`badge ${connected ? "badge--ok" : "badge--down"}`}
          >
            Socket.IO: {connected ? "Connected" : "Disconnected"}
          </span>
          <button
            type="button"
            className="button"
            onClick={() => void handlePull()}
            disabled={pulling}
          >
            {pulling ? "Queueing pull…" : "Pull trades now"}
          </button>
        </div>
      </header>

      {pullError && <p className="alert alert--error">{pullError}</p>}

      <section className="cards">
        <article className="card">
          <span className="card__label">Total trades</span>
          <strong className="card__value">
            {totals ? formatNumber(totals.totalTrades) : "—"}
          </strong>
        </article>
        <article className="card">
          <span className="card__label">Total quantity</span>
          <strong className="card__value">
            {totals ? formatNumber(totals.totalQuantity) : "—"}
          </strong>
        </article>
        <article className="card">
          <span className="card__label">Turnover</span>
          <strong className="card__value">
            {totals ? `₹${formatValue(totals.totalValue)}` : "—"}
          </strong>
        </article>
        <article className="card">
          <span className="card__label">Live events received</span>
          <strong className="card__value">
            {formatNumber(trades.liveCount)}
          </strong>
        </article>
        <article className="card">
          <span className="card__label">Queue</span>
          <strong className="card__value">
            {pullStatus
              ? `${formatNumber(pullStatus.waiting + pullStatus.active)} pending`
              : "—"}
          </strong>
        </article>
      </section>

      <section className="filters">
        <input
          className="input"
          placeholder="Filter by symbol (e.g. RELIANCE)"
          value={symbol}
          onChange={(event) => {
            setSymbol(event.target.value.toUpperCase());
            setPage(1);
          }}
        />
        <input
          className="input"
          placeholder="Filter by client (e.g. CLIENT-0014)"
          value={client}
          onChange={(event) => {
            setClient(event.target.value.toUpperCase());
            setPage(1);
          }}
        />
      </section>

      <section className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Trade ID</th>
              <th>Time</th>
              <th>Symbol</th>
              <th>Client</th>
              <th className="numeric">Quantity</th>
              <th className="numeric">Price</th>
              <th className="numeric">Value</th>
            </tr>
          </thead>
          <tbody>
            {trades.trades.length === 0 && !trades.loading && (
              <tr>
                <td colSpan={7} className="empty">
                  No trades match the current filters.
                </td>
              </tr>
            )}

            {trades.trades.map((trade) => (
              <tr key={trade.tradeId}>
                <td className="mono">{trade.tradeId}</td>
                <td className="mono">{formatTime(trade.timestamp)}</td>
                <td>{trade.symbol}</td>
                <td className="mono">{trade.client}</td>
                <td className="numeric">{formatNumber(trade.quantity)}</td>
                <td className="numeric">₹{formatValue(trade.price)}</td>
                <td className="numeric">
                  ₹{formatValue(Number(trade.price) * trade.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {trades.loading && <p className="hint">Loading trades…</p>}
        {trades.error && <p className="alert alert--error">{trades.error}</p>}
        {trades.summaryError && (
          <p className="alert alert--warn">{trades.summaryError}</p>
        )}
      </section>

      <footer className="pagination">
        <button
          type="button"
          className="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1 || trades.loading}
        >
          Previous
        </button>
        <span className="pagination__label">
          Page {trades.page} of {trades.totalPages} ·{" "}
          {formatNumber(trades.total)} trades
        </span>
        <button
          type="button"
          className="button"
          onClick={() =>
            setPage((current) => Math.min(trades.totalPages, current + 1))
          }
          disabled={page >= trades.totalPages || trades.loading}
        >
          Next
        </button>
      </footer>
    </main>
  );
}

export default App;
