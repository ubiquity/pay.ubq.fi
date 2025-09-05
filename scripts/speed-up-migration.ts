#!/usr/bin/env bun
/**
 * Speed Up Migration Script
 * 
 * This is a wrapper around speed-up.ts in the nonce-migration directory
 * that provides the interface mentioned in the agent documentation.
 * Replaces pending transactions with higher gas, calculates gas within budget constraints,
 * and handles "already known" errors gracefully.
 */

import { spawn } from "bun";
import path from "path";

const NONCE_MIGRATION_DIR = path.join(__dirname, "nonce-migration");
const SPEED_UP_SCRIPT = path.join(NONCE_MIGRATION_DIR, "speed-up.ts");

console.log("⚡ Speeding up migration transactions...");
console.log("This is a wrapper around nonce-migration/speed-up.ts for the interface described in the agent documentation.");
console.log("");

// Execute the actual speed-up.ts script
const proc = spawn({
  cmd: ["bun", SPEED_UP_SCRIPT, ...process.argv.slice(2)],
  stdio: ["inherit", "inherit", "inherit"],
});

const exitCode = await proc.exited;
process.exit(exitCode);
