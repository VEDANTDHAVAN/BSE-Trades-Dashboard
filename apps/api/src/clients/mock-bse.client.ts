import { config } from "../config.js";

export interface MockBseTrade {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
}

export interface MockBseTradesResponse {
  trades: MockBseTrade[];
  count: number;
}

export async function fetchMockBseTrades(
  limit = 50,
): Promise<MockBseTrade[]> {
  const baseUrl =
    process.env.MOCK_BSE_URL ??
    "http://localhost:4000/mock-bse/getTrades";

  // Defaults to 16 minutes so a maximum-length (15-minute) pull never aborts.
  // This is the worker's own server-side connection, not a browser request.
  const timeoutMs = config.mockBse.timeoutMs;

  const url = new URL(baseUrl);
  url.searchParams.set("limit", String(limit));

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Mock BSE API returned HTTP ${response.status}`,
      );
    }

    const data =
      (await response.json()) as MockBseTradesResponse;

    if (!Array.isArray(data.trades)) {
      throw new Error(
        "Mock BSE API returned an invalid trades response",
      );
    }

    return data.trades;
  } finally {
    clearTimeout(timeout);
  }
}