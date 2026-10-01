import { defineConfig, devices } from "@playwright/test";

// Parcours de bout en bout, dans un environnement isolé démarré par Playwright :
// - API sur :4100 en LLM_MODE=replay (aucun appel à OpenAI), base `kyb_e2e` et bucket `kyb-e2e` dédiés ;
// - front en build de production sur :3100, dans `.next-e2e` pour ne pas gêner un `next dev` en cours.
// Prérequis : MongoDB (27017) et MinIO (9000) démarrés, back/.env renseigné (identifiants MinIO, clé de chiffrement).
// Usage : npm run test:e2e --workspace=front
const API_PORT = 4100;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // En local : Edge déjà installé sous Windows, pas de navigateur à télécharger. En CI : Chromium de Playwright.
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "msedge" },
    },
  ],
  webServer: [
    {
      command: "npm run build --workspace=@kyb/shared && npx tsx src/index.ts",
      cwd: "../back",
      url: `http://localhost:${API_PORT}/health`,
      env: {
        PORT: String(API_PORT),
        LLM_MODE: "replay",
        MONGO_URL: "mongodb://localhost:27017/kyb_e2e",
        S3_BUCKET: "kyb-e2e",
        LOG_LEVEL: "warn",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { NEXT_DIST_DIR: ".next-e2e", API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
