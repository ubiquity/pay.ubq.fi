import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    setupNodeEvents() {
      // implement node event listeners here
    },
    baseUrl: "http://localhost:8080",
    experimentalStudio: true,
    env: {
      permitConfig: { ...process.env },
    },
  },
  viewportHeight: 900,
  viewportWidth: 1440,
  watchForFileChanges: false,
  video: true,
});
