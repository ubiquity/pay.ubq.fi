import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    dir: "tests",
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
      main: "./functions/get-best-card.ts",
    },
  },
});
