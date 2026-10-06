import { Router } from "express";

import {
  DEFAULT_TRADE_PAGE_SIZE,
  MAX_TRADE_PAGE_SIZE,
  TRADE_SYMBOLS,
  getTradeTotals,
  listSymbolSummaries,
  listTrades,
} from "../services/trade-query.service.js";

const router = Router();

function parsePositiveInt(
  rawValue: unknown,
  fallback: number,
  max: number,
): number | null {
  if (rawValue === undefined) return fallback;

  if (typeof rawValue !== "string" || !/^\d+$/u.test(rawValue)) {
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return null;
  }

  return value;
}

function parseTimestamp(rawValue: unknown): Date | null | undefined {
  if (rawValue === undefined) return undefined;

  if (typeof rawValue !== "string") return null;

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

router.get("/symbols", (_req, res) => {
  res.json({ symbols: TRADE_SYMBOLS });
});

router.get("/summary", async (_req, res, next) => {
  try {
    const [totals, symbols] = await Promise.all([
      getTradeTotals(),
      listSymbolSummaries(),
    ]);

    res.json({ totals, symbols });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(
      req.query.pageSize,
      DEFAULT_TRADE_PAGE_SIZE,
      MAX_TRADE_PAGE_SIZE,
    );

    if (page === null || pageSize === null) {
      res.status(400).json({
        error: `page must be a positive integer and pageSize an integer from 1 to ${MAX_TRADE_PAGE_SIZE}`,
      });
      return;
    }

    const since = parseTimestamp(req.query.since);
    const until = parseTimestamp(req.query.until);

    if (since === null || until === null) {
      res.status(400).json({
        error: "since and until must be valid ISO-8601 timestamps",
      });
      return;
    }

    if (since && until && since > until) {
      res.status(400).json({
        error: "since must be earlier than or equal to until",
      });
      return;
    }

    const symbol =
      typeof req.query.symbol === "string" && req.query.symbol.length > 0
        ? req.query.symbol.toUpperCase()
        : undefined;

    const client =
      typeof req.query.client === "string" && req.query.client.length > 0
        ? req.query.client.toUpperCase()
        : undefined;

    const result = await listTrades({
      page,
      pageSize,
      symbol,
      client,
      since,
      until,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;