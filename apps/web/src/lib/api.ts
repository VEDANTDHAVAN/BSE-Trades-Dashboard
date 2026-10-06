export interface Trade {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: string;
  timestamp: string;
}

export interface TradesResponse {
  trades: Trade[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TradeTotals {
  totalTrades: number;
  totalQuantity: number;
  totalValue: string;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
}

export interface SymbolSummary {
  symbol: string;
  tradeCount: number;
  totalQuantity: number;
  lastPrice: string;
  lastTradeAt: string;
}

export interface TradesSummaryResponse {
  totals: TradeTotals;
  symbols: SymbolSummary[];
}

export interface PullStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchTrades(params: {
  page: number;
  pageSize: number;
  symbol?: string;
  client?: string;
  signal?: AbortSignal;
}): Promise<TradesResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });

  if (params.symbol) query.set("symbol", params.symbol);
  if (params.client) query.set("client", params.client);

  return getJson<TradesResponse>(`/api/trades?${query.toString()}`, params.signal);
}

export function fetchTradeSummary(signal?: AbortSignal): Promise<TradesSummaryResponse> {
  return getJson<TradesSummaryResponse>("/api/trades/summary", signal);
}

export function fetchPullStatus(signal?: AbortSignal): Promise<PullStatus> {
  return getJson<PullStatus>("/api/trades/pull/status", signal);
}

export async function requestTradePull(limit: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/trades/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
  });

  if (!response.ok) {
    throw new Error(`Trade pull request failed with HTTP ${response.status}`);
  }
}
