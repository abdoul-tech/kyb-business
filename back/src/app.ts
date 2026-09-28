import express from "express";
import { applicationsRouter } from "./http/routes/applications.js";
import { errorHandler } from "./http/middleware/errors.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/v1/applications", applicationsRouter);

  app.use(errorHandler);

  return app;
}
