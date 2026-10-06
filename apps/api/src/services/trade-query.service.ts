import { prisma } from "../lib/prisma.js";

export const TRADE_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "INFY",
  "HDFCBANK",
  "ICICIBANK",
  "SBIN",
  "ITC",
  "LT",
  "BHARTIARTL",
  "AXISBANK",
  "MARUTI",
  "SUNPHARMA",
  "TATAMOTORS",
  "TATASTEEL",
  "HINDUNILVR",
] as const;

export const DEFAULT_TRADE_PAGE_SIZE = 25;
export const MAX_TRADE_PAGE_SIZE = 100;

export interface TradeQueryParams {
  page: number;
  pageSize: number;
  symbol?: string;
  client?: string;
  since?: Date;
  until?: Date;
}

export interface TradeListItem {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: string;
  timestamp: string;
}

export interface TradeListResult {
  trades: TradeListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function toTradeListItem(trade: {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: { toString(): string };
  timestamp: Date;
}): TradeListItem {
  return {
    tradeId: trade.tradeId,
    client: trade.client,
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.price.toString(),
    timestamp: trade.timestamp.toISOString(),
  };
}

export async function listTrades(
  params: TradeQueryParams,
): Promise<TradeListResult> {
  const where = {
    ...(params.symbol ? { symbol: params.symbol } : {}),
    ...(params.client ? { client: params.client } : {}),
    ...(params.since || params.until
      ? {
          timestamp: {
            ...(params.since ? { gte: params.since } : {}),
            ...(params.until ? { lte: params.until } : {}),
          },
        }
      : {}),
  };

  const [total, trades] = await Promise.all([
    prisma.trade.count({ where }),
    prisma.trade.findMany({
      where,
      orderBy: [{ timestamp: "desc" }, { tradeId: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        tradeId: true,
        client: true,
        symbol: true,
        quantity: true,
        price: true,
        timestamp: true,
      },
    }),
  ]);

  return {
    trades: trades.map(toTradeListItem),
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export interface SymbolSummary {
  symbol: string;
  tradeCount: number;
  totalQuantity: number;
  lastPrice: string;
  lastTradeAt: string;
}

export async function listSymbolSummaries(): Promise<SymbolSummary[]> {
  const grouped = await prisma.trade.groupBy({
    by: ["symbol"],
    where: { symbol: { in: [...TRADE_SYMBOLS] } },
    _count: { _all: true },
    _sum: { quantity: true },
    _max: { timestamp: true },
  });

  const latestPrices = await Promise.all(
    grouped.map(async (row) => {
      const lastTradeAt = row._max.timestamp;
      if (!lastTradeAt) return null;

      const latest = await prisma.trade.findFirst({
        where: { symbol: row.symbol },
        orderBy: [{ timestamp: "desc" }, { tradeId: "desc" }],
        select: { price: true },
      });

      return latest ? latest.price.toString() : null;
    }),
  );

  return grouped
    .map((row, index) => {
      const lastTradeAt = row._max.timestamp;
      if (!lastTradeAt) return null;

      return {
        symbol: row.symbol,
        tradeCount: row._count._all,
        totalQuantity: row._sum.quantity ?? 0,
        lastPrice: latestPrices[index] ?? "0",
        lastTradeAt: lastTradeAt.toISOString(),
      } satisfies SymbolSummary;
    })
    .filter((summary): summary is SymbolSummary => summary !== null)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export interface TradeTotals {
  totalTrades: number;
  totalQuantity: number;
  totalValue: string;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
}

export async function getTradeTotals(): Promise<TradeTotals> {
  const [aggregate, valueRow, first, last] = await Promise.all([
    prisma.trade.aggregate({
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.$queryRaw<
      Array<{ totalValue: string | null }>
    >`SELECT COALESCE(SUM(quantity * price), 0)::text AS "totalValue" FROM "Trade"`,
    prisma.trade.findFirst({
      orderBy: [{ timestamp: "asc" }, { tradeId: "asc" }],
      select: { timestamp: true },
    }),
    prisma.trade.findFirst({
      orderBy: [{ timestamp: "desc" }, { tradeId: "desc" }],
      select: { timestamp: true },
    }),
  ]);

  return {
    totalTrades: aggregate._count._all,
    totalQuantity: aggregate._sum.quantity ?? 0,
    totalValue: Number(valueRow[0]?.totalValue ?? 0).toFixed(2),
    firstTradeAt: first?.timestamp.toISOString() ?? null,
    lastTradeAt: last?.timestamp.toISOString() ?? null,
  };
}