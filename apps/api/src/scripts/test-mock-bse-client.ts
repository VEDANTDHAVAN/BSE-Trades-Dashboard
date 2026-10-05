import { fetchMockBseTrades } from "../clients/mock-bse.client";

async function main() {
  console.log("Calling Mock BSE API...");

  const start = Date.now();

  const trades = await fetchMockBseTrades(3);

  const duration = Date.now() - start;

  console.log("Received:", trades.length);
  console.log("Duration:", `${duration}ms`);
  console.log("Trades:", trades);

  if (trades.length !== 3) {
    throw new Error(
      `Expected 3 trades but received ${trades.length}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});