import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { MockBseTrade } from "../clients/mock-bse.client";

export interface PersistedTrade {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
}

export interface PersistTradesResult {
  received: number;
  inserted: number;
  duplicates: number;
  insertedTrades: PersistedTrade[];
}

export async function persistTrades(
  trades: MockBseTrade[],
): Promise<PersistTradesResult> {
  if (trades.length === 0) {
    return {
      received: 0,
      inserted: 0,
      duplicates: 0,
      insertedTrades: [],
    };
  }

  const existingTrades = await prisma.trade.findMany({
    where: {
      tradeId: {
        in: trades.map((trade) => trade.tradeId),
      },
    },
    select: {
      tradeId: true,
    },
  });

  const existingTradeIds = new Set(
    existingTrades.map((trade) => trade.tradeId),
  );

  const newTrades = trades.filter(
    (trade) => !existingTradeIds.has(trade.tradeId),
  );

  if (newTrades.length > 0) {
    await prisma.trade.createMany({
      data: newTrades.map((trade) => ({
        tradeId: trade.tradeId,
        client: trade.client,
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: new Prisma.Decimal(trade.price),
        timestamp: new Date(trade.timestamp),
      })),
      skipDuplicates: true,
    });
  }

  return {
    received: trades.length,
    inserted: newTrades.length,
    duplicates: trades.length - newTrades.length,
    insertedTrades: newTrades.map((trade) => ({
      tradeId: trade.tradeId,
      client: trade.client,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: Number(trade.price),
      timestamp: new Date(trade.timestamp).toISOString(),
    })),
  };
}