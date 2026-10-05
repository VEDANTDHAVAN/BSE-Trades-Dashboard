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

export type MockTrade = {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
};

let sequence = 0;

export function generateMockTrades(limit: number): MockTrade[] {
  const generatedAt = Date.now();

  return Array.from({ length: limit }, (_, index) => {
    sequence += 1;
    const symbol = SYMBOLS[sequence % SYMBOLS.length] ?? SYMBOLS[0];
    const price = 500 + ((sequence * 7919) % 2_000_000) / 100;

    return {
      tradeId: `BSE-MOCK-${String(sequence).padStart(6, "0")}`,
      client: `CLIENT-${String((sequence * 17) % 120 + 1).padStart(4, "0")}`,
      symbol,
      quantity: ((sequence * 13) % 100 + 1) * 10,
      price: Number(price.toFixed(2)),
      timestamp: new Date(generatedAt - (limit - index) * 1000).toISOString(),
    };
  });
}
