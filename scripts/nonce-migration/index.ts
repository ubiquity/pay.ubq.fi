#!/usr/bin/env bun
/**
 * Nonce Migration Tools
 * Entry point for migrating nonces from Permit2 to Permit3
 */

import { program } from "commander";

program
  .name("nonce-migration")
  .description("Tools for migrating nonces from Permit2 to Permit3 on Gnosis chain")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze database and identify nonces needing migration")
  .action(async () => {
    const { analyzeNonces } = await import("./analyze-nonces");
    await analyzeNonces();
  });

program
  .command("migrate")
  .description("Execute nonce migration")
  .option("--dry-run", "Simulate without sending transactions")
  .option("--cache-file <path>", "Path to cache file", "cache/migration-cache.json")
  .action(async (options) => {
    const { runMigration } = await import("./run-migration");
    await runMigration(options);
  });

program
  .command("speed-up")
  .description("Speed up pending transactions with higher gas")
  .option("--cache-file <path>", "Path to cache file", "cache/migration-cache.json")
  .action(async (options) => {
    const { speedUpTransactions } = await import("./speed-up");
    await speedUpTransactions(options);
  });

program
  .command("status")
  .description("Check migration status")
  .option("--cache-file <path>", "Path to cache file", "cache/migration-cache.json")
  .action(async (options) => {
    const { checkStatus } = await import("./check-status");
    await checkStatus(options);
  });

program.parse();