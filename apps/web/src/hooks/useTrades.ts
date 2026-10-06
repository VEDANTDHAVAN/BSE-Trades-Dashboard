import { useCallback, useEffect, useState } from "react";

import {
  fetchTrades,
  fetchTradeSummary,
  type TradesSummaryResponse,
  type TradesResponse,
} from "../lib/api";
import type { TradeCreatedPayload } from "./useSockets";

/** Newest live trades are prepended while page 1 is showing, capped at this many rows. */
const MAX_LIVE_ROWS = 100;
const SUMMARY_POLL_MS = 15000;

export interface TradesFilters {
  page: number;
  pageSize: number;
  symbol?: string;
  client?: string;
}

interface TradesState {
  trades: TradesResponse["trades"];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
}

function toApiTrade(trade: TradeCreatedPayload) {
  return {
    tradeId: trade.tradeId,
    client: trade.client,
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.price.toFixed(2),
    timestamp: trade.timestamp,
  };
}

export function useTrades(filters: TradesFilters) {
  const [state, setState] = useState<TradesState>({
    trades: [],
    page: filters.page,
    pageSize: filters.pageSize,
    total: 0,
    totalPages: 1,
    loading: true,
    error: null,
  });

  const [summary, setSummary] = useState<TradesSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, loading: true, error: null }));

    void (async () => {
      try {
        const response = await fetchTrades({
          page: filters.page,
          pageSize: filters.pageSize,
          symbol: filters.symbol,
          client: filters.client,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setState({
          trades: response.trades,
          page: response.page,
          pageSize: response.pageSize,
          total: response.total,
          totalPages: response.totalPages,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to load trades",
        }));
      }
    })();

    return () => controller.abort();
  }, [filters.page, filters.pageSize, filters.symbol, filters.client]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetchTradeSummary(controller.signal);
        if (cancelled) return;
        setSummary(response);
        setSummaryError(null);
      } catch (error) {
        if (cancelled) return;
        setSummaryError(
          error instanceof Error ? error.message : "Failed to load summary",
        );
      }
    };

    void load();
    const timer = setInterval(() => void load(), SUMMARY_POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const handleTradeCreated = useCallback((trade: TradeCreatedPayload) => {
    setLiveCount((current) => current + 1);

    const incoming = toApiTrade(trade);

    setState((current) => {
      // Live inserts only extend the newest page; other pages stay as fetched.
      if (current.page !== 1) return current;
      if (current.trades.some((row) => row.tradeId === incoming.tradeId)) {
        return current;
      }

      return {
        ...current,
        trades: [incoming, ...current.trades].slice(0, MAX_LIVE_ROWS),
        total: current.total + 1,
      };
    });
  }, []);

  return {
    ...state,
    summary,
    summaryError,
    liveCount,
    handleTradeCreated,
  };
}
