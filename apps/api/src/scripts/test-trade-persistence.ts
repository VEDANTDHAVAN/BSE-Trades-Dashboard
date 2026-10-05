import { fetchMockBseTrades } from "../clients/mock-bse.client";
import { persistTrades } from "../services/trade-persistence.service";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Fetching trades...");

  const trades = await fetchMockBseTrades(3);

  console.log("Persisting trades...");

  const first = await persistTrades(trades);

  console.log("First insert:", first);

  const second = await persistTrades(trades);

  console.log("Second insert:", second);

  await prisma.$disconnect();

  if (second.duplicates !== trades.length) {
    throw new Error("Duplicate handling failed");
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});