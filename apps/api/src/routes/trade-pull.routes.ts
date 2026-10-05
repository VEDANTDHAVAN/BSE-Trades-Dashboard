import { Router } from "express";
import { tradePullQueue } from "../queues/trade-pull.queue";

const router = Router();

router.get("/pull/status", async (_req, res, next) => {
  try {
    const [waiting, active, completed, failed] =
      await Promise.all([
        tradePullQueue.getWaitingCount(),
        tradePullQueue.getActiveCount(),
        tradePullQueue.getCompletedCount(),
        tradePullQueue.getFailedCount(),
      ]);

    res.json({
      waiting,
      active,
      completed,
      failed,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/pull", async (req, res, next) => {
  try {
    const limit =
      req.body?.limit === undefined
        ? 50
        : Number(req.body.limit);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({
        error: "limit must be an integer between 1 and 100",
      });
      return;
    }

    const job = await tradePullQueue.add("pull-trades", {
      limit,
    });

    res.status(202).json({
      status: "queued",
      jobId: job.id,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

export default router;