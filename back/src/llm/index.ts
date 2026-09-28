import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { createLlmClient } from "./client.js";
import { createOpenAiTransport } from "./openai-transport.js";

// fixtures/llm à la racine du repo (même profondeur depuis src/llm et dist/llm).
const defaultFixturesDir = fileURLToPath(new URL("../../../fixtures/llm", import.meta.url));

export const llm = createLlmClient({
  mode: env.LLM_MODE,
  models: {
    classify: env.LLM_MODEL_CLASSIFY,
    extract: env.LLM_MODEL_EXTRACT,
    generate: env.LLM_MODEL_GENERATE,
  },
  fixturesDir: env.LLM_FIXTURES_DIR ?? defaultFixturesDir,
  transport: env.OPENAI_API_KEY ? createOpenAiTransport(env.OPENAI_API_KEY) : undefined,
});
