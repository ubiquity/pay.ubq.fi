#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

console.log("Simple double claim test using the same logic as main script...");

// Fetch ALL permits by setting a high limit (Supabase default is 1000)
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
  .limit(2000)

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

// Group permits by nonce for double-claim detection
const allPermitsByNonce = new Map<string, any[]>();

if (data) {
  for (const permit of data) {
    const nonceKey = permit.nonce.toString();
    if (!allPermitsByNonce.has(nonceKey)) {
      allPermitsByNonce.set(nonceKey, []);
    }
    allPermitsByNonce.get(nonceKey)!.push(permit);
  }
}

console.log(`Total unique nonces: ${allPermitsByNonce.size}`);

// Check for double claims
let doubleClaimCount = 0;
for (const [nonceStr, permitsWithSameNonce] of allPermitsByNonce.entries()) {
  const claimedPermitsWithSameNonce = permitsWithSameNonce.filter(p => p.transaction);
  
  if (claimedPermitsWithSameNonce.length > 1) {
    doubleClaimCount++;
    console.log(`\n🚨 DOUBLE CLAIM DETECTED for nonce ${nonceStr}:`);
    console.log(`  Found ${claimedPermitsWithSameNonce.length} claimed permits with the same nonce`);
    
    for (const permit of claimedPermitsWithSameNonce) {
      console.log(`  - Permit ${permit.id}: TX ${permit.transaction}`);
      console.log(`    Owner: ${permit.partners?.wallets?.address}`);
      console.log(`    Network: ${permit.tokens?.network}`);
      console.log(`    Amount: ${permit.amount}`);
    }
  }
}

if (doubleClaimCount === 0) {
  console.log("\n✅ No double claims found in database");
} else {
  console.log(`\n🚨 Found ${doubleClaimCount} double claims!`);
}