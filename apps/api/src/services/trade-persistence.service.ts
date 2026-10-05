import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { MockBseTrade } from "../clients/mock-bse.client";

export interface PersistTradesResult {
  received: number;
  inserted: number;
  duplicates: number;
}

export async function persistTrades(
  trades: MockBseTrade[],
): Promise<PersistTradesResult> {
  if (trades.length === 0) {
    return {
      received: 0,
      inserted: 0,
      duplicates: 0,
    };
  }

  const result = await prisma.trade.createMany({
    data: trades.map((trade) => ({
      tradeId: trade.tradeId,
      client: trade.client,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: new Prisma.Decimal(trade.price),
      timestamp: new Date(trade.timestamp),
    })),
    skipDuplicates: true,
  });

  return {
    received: trades.length,
    inserted: result.count,
    duplicates: trades.length - result.count,
  };
}