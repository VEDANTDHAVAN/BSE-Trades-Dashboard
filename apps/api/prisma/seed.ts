import { Prisma } from "@prisma/client";

import { prisma } from "../src/lib/prisma.js";

const TRADE_COUNT = 3000;
const SYMBOLS = [
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

const CLIENT_COUNT = 120;
const START_TIMESTAMP = Date.UTC(2024, 0, 2, 9, 15);

function nextRandom(state: number): { state: number; value: number } {
  const nextState = (state * 1664525 + 1013904223) >>> 0;
  return { state: nextState, value: nextState / 0x1_0000_0000 };
}

function generateTrades(): Prisma.TradeCreateManyInput[] {
  const trades: Prisma.TradeCreateManyInput[] = [];
  let randomState = 0xb5e_2024;

  for (let index = 1; index <= TRADE_COUNT; index += 1) {
    const symbolRandom = nextRandom(randomState);
    randomState = symbolRandom.state;
    const quantityRandom = nextRandom(randomState);
    randomState = quantityRandom.state;
    const priceRandom = nextRandom(randomState);
    randomState = priceRandom.state;
    const clientRandom = nextRandom(randomState);
    randomState = clientRandom.state;

    const timestamp = new Date(START_TIMESTAMP + (index - 1) * 60_000);
    const priceInPaise = 500_000 + Math.floor(priceRandom.value * 9_500_000);
    const price = (priceInPaise / 100).toFixed(2);

    trades.push({
      tradeId: `TRD-${String(index).padStart(6, "0")}`,
      client: `CLIENT-${String(Math.floor(clientRandom.value * CLIENT_COUNT) + 1).padStart(4, "0")}`,
      symbol: SYMBOLS[Math.floor(symbolRandom.value * SYMBOLS.length)],
      quantity: (Math.floor(quantityRandom.value * 100) + 1) * 10,
      price,
      timestamp,
      createdAt: timestamp,
    });
  }

  return trades;
}

async function main(): Promise<void> {
  console.log("Seeding database...");
  const trades = generateTrades();
  console.log(`Generated ${trades.length} trades`);

  const result = await prisma.trade.createMany({
    data: trades,
    skipDuplicates: true,
  });
  const total = await prisma.trade.count();

  console.log(`Inserted ${result.count} trades`);
  console.log(`Trade table now contains ${total} records`);
  console.log("Seed completed successfully");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
