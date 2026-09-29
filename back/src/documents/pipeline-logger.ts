import type { Logger } from "pino";
import type { PipelineLogger } from "./pipeline.js";

// Adapte pino à l'interface minimale du pipeline (événement + identifiants).
export function pinoPipelineLogger(logger: Logger): PipelineLogger {
  return {
    info: (event, data) => logger.info({ event, ...data }, event),
    error: (event, data) => logger.error({ event, ...data }, event),
  };
}
