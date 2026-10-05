import cors from "cors";
import express from "express";
import helmet from "helmet";

import healthRouter from "./routes/health.routes.js";
import mockBseRouter from "./mock-bse/mock-bse.routes.js";
import tradePullRoutes from "./routes/trade-pull.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(mockBseRouter);
app.use("/api/trades", tradePullRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});
