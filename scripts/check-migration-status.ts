#!/usr/bin/env bun
/**
 * Check Migration Status Script
 * 
 * This is a wrapper around check-status.ts in the nonce-migration directory
 * that provides the interface mentioned in the agent documentation.
 * Verifies on-chain migration status, samples word positions to check bitmaps,
 * and reports completion percentage.
 */

import { spawn } from "bun";
import path from "path";

const NONCE_MIGRATION_DIR = path.join(__dirname, "nonce-migration");
const CHECK_STATUS_SCRIPT = path.join(NONCE_MIGRATION_DIR, "check-status.ts");

console.log("📊 Checking migration status...");
console.log("This is a wrapper around nonce-migration/check-status.ts for the interface described in the agent documentation.");
console.log("");

// Execute the actual check-status.ts script
const proc = spawn({
  cmd: ["bun", CHECK_STATUS_SCRIPT, ...process.argv.slice(2)],
  stdio: ["inherit", "inherit", "inherit"],
});

const exitCode = await proc.exited;
process.exit(exitCode);
