#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

console.log("Testing if permits 1488 and 1769 are included in enhanced script query...\n");

// Use exact same query as enhanced script with 1500 limit
const { data, error } = await supabase
  .from("permits")
  .select(`
    id,
    nonce,
    transaction,
    amount,
    beneficiary_id,
    tokens(
      network,
      address
    ),
    partners(
      wallets(
        address
      )
    ),
    locations(
      node_url,
      issue_id,
      repository_id,
      organization_id
    )
  `)
  .limit(1800)
  .order('id', { ascending: true });

if (error) {
  throw new Error(`Failed to fetch permits: ${error.message}`);
}

console.log(`Total permits fetched: ${data?.length}`);

// Check for our known double-claim permits
const permit1488 = data?.find(p => p.id === 1488);
const permit1769 = data?.find(p => p.id === 1769);
console.log(`Permit 1488 found: ${permit1488 ? 'YES' : 'NO'}`);
console.log(`Permit 1769 found: ${permit1769 ? 'YES' : 'NO'}`);

if (permit1488) {
  console.log(`Permit 1488 nonce: ${permit1488.nonce}, transaction: ${permit1488.transaction}`);
}
if (permit1769) {
  console.log(`Permit 1769 nonce: ${permit1769.nonce}, transaction: ${permit1769.transaction}`);
}

// Check if both permits have the same nonce
if (permit1488 && permit1769) {
  const sameNonce = permit1488.nonce === permit1769.nonce;
  console.log(`\nPermits have same nonce: ${sameNonce}`);
  
  if (sameNonce && permit1488.transaction && permit1769.transaction) {
    console.log(`🚨 DOUBLE CLAIM FOUND:`);
    console.log(`  Nonce: ${permit1488.nonce}`);
    console.log(`  Permit 1488 TX: ${permit1488.transaction}`);
    console.log(`  Permit 1769 TX: ${permit1769.transaction}`);
  }
} else {
  console.log("\n❌ Both permits not found - they are likely beyond the 1500 limit");
}

// Check max ID in results
if (data && data.length > 0) {
  const maxId = Math.max(...data.map(p => p.id));
  const minId = Math.min(...data.map(p => p.id));
  console.log(`\nPermit ID range: ${minId} - ${maxId}`);
  console.log(`Permits 1488 and 1769 are ${maxId >= 1769 ? 'within' : 'beyond'} this range`);
}