import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kyb/shared"],
  // Les tests Playwright buildent dans un dossier à part pour ne pas gêner un `next dev` en cours.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
