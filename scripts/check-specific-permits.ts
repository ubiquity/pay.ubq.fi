#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

console.log("Checking if permits 1488 and 1769 exist in raw permits table...\n");

// Check raw permits table first
const { data: rawPermits, error: rawError } = await supabase
  .from("permits")
  .select("id, nonce, transaction, partner_id, token_id")
  .in("id", [1488, 1769]);

if (rawError) {
  console.error("Error fetching raw permits:", rawError);
} else {
  console.log("Raw permits found:");
  console.log(rawPermits);
}

// Check with joins to see what breaks
console.log("\nTrying with full joins...");
const { data: joinedPermits, error: joinError } = await supabase
  .from("permits")
  .select(`
    id,
    nonce,
    transaction,
    tokens(network, address),
    partners(wallets(address))
  `)
  .in("id", [1488, 1769]);

if (joinError) {
  console.error("Join error:", joinError);
} else {
  console.log("Joined permits:");
  console.log(JSON.stringify(joinedPermits, null, 2));
}

// Check total count without any limit
console.log("\nChecking total permit count...");
const { count, error: countError } = await supabase
  .from("permits")
  .select("*", { count: 'exact', head: true });

if (countError) {
  console.error("Count error:", countError);
} else {
  console.log(`Total permits in database: ${count}`);
}