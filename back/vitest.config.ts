import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Spec : les tests n'appellent jamais le vrai LLM, même si back/.env contient une clé.
    env: { LLM_MODE: "replay" },
  },
});
