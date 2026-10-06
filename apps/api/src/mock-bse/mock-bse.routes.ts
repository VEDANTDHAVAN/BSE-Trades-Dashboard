import { Router } from "express";

import { config } from "../config.js";
import { generateMockTrades, setMockTradeSequence } from "./trade-generator.js";
import { prisma } from "../lib/prisma.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(rawLimit: unknown): number | null {
  if (rawLimit === undefined) return DEFAULT_LIMIT;
  if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) return null;

  const limit = Number(rawLimit);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

const router = Router();

let sequenceSeeded = false;

async function seedMockTradeSequence(): Promise<void> {
  if (sequenceSeeded) return;

  const latest = await prisma.trade.findFirst({
    where: { tradeId: { startsWith: "BSE-MOCK-" } },
    select: { tradeId: true },
    orderBy: { tradeId: "desc" },
  });

  if (latest) {
    const match = /^BSE-MOCK-(\d+)$/.exec(latest.tradeId);
    if (match) {
      setMockTradeSequence(Number(match[1]));
    }
  }

  sequenceSeeded = true;
}

router.get("/mock-bse/getTrades", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    res.status(400).json({ error: "limit must be an integer from 1 to 100" });
    return;
  }

  try {
    await seedMockTradeSequence();
    await new Promise<void>((resolve) => setTimeout(resolve, config.mockBse.delayMs));
    const trades = generateMockTrades(limit);
    res.status(200).json({ trades, count: trades.length });
  } catch {
    res.status(500).json({ error: "Unable to generate mock trades" });
  }
});

export default router;
