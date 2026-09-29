import express from "express";
import type { Logger } from "pino";
import { applicationsRouter } from "./http/routes/applications.js";
import { errorHandler } from "./http/middleware/errors.js";
import { requestLog } from "./http/middleware/request-log.js";
import { logger as defaultLogger } from "./logger.js";

export function createApp(options: { logger?: Logger } = {}) {
  const app = express();
  app.use(requestLog(options.logger ?? defaultLogger));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/v1/applications", applicationsRouter);

  app.use(errorHandler);

  return app;
}
