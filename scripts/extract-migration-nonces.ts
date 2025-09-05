#!/usr/bin/env bun
/**
 * Extract Migration Nonces Script
 * 
 * This is a wrapper around analyze-nonces.ts that provides the interface
 * mentioned in the agent documentation. It analyzes the database for permits
 * needing migration, checks nonce status on both contracts, and generates
 * a migration plan with cache.
 */

import { spawn } from "bun";
import path from "path";

const NONCE_MIGRATION_DIR = path.join(__dirname, "nonce-migration");
const ANALYZE_SCRIPT = path.join(NONCE_MIGRATION_DIR, "analyze-nonces.ts");

console.log("🔍 Extracting migration nonces...");
console.log("This is a wrapper around analyze-nonces.ts for the interface described in the agent documentation.");
console.log("");

// Execute the actual analyze-nonces.ts script
const proc = spawn({
  cmd: ["bun", ANALYZE_SCRIPT, ...process.argv.slice(2)],
  stdio: ["inherit", "inherit", "inherit"],
});

const exitCode = await proc.exited;
process.exit(exitCode);
