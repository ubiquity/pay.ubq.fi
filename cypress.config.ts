import { defineConfig } from "cypress";
import { config } from "dotenv";

config();

export default defineConfig({
  e2e: {
    setupNodeEvents() {},
    baseUrl: "http://localhost:8080",
    experimentalStudio: true,
  },
  viewportHeight: 900,
  viewportWidth: 1440,
  watchForFileChanges: false,
  video: true,
});
