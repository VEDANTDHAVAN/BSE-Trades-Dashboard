import cors from "cors";
import express from "express";
import helmet from "helmet";

import healthRouter from "./routes/health.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(healthRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});