#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Query exactly as in our main script
const { data, error } = await supabase
  .from("permits")
  .select(
    `
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
  `
  );

if (error) {
  console.error("Error:", error);
} else {
  console.log(`Total permits fetched: ${data?.length}`);
  
  // Check for our test nonce
  const testNonce = "35205825218713176781923704351315377070369795007350107662811700128250561551111";
  const testPermits = data?.filter(p => p.nonce === testNonce);
  
  console.log(`\nPermits with test nonce ${testNonce}:`);
  for (const permit of testPermits || []) {
    console.log(`  - Permit ID: ${permit.id}, Network: ${permit.tokens?.network}, Transaction: ${permit.transaction}`);
  }
  
  // Count permits by nonce to find duplicates
  const permitsByNonce = new Map<string, any[]>();
  for (const permit of data || []) {
    const nonce = permit.nonce;
    if (!permitsByNonce.has(nonce)) {
      permitsByNonce.set(nonce, []);
    }
    permitsByNonce.get(nonce)!.push(permit);
  }
  
  // Find nonces with multiple permits
  let duplicateCount = 0;
  for (const [nonce, permits] of permitsByNonce.entries()) {
    if (permits.length > 1) {
      duplicateCount++;
      const claimedCount = permits.filter(p => p.transaction).length;
      if (claimedCount > 1) {
        console.log(`\n🚨 Double claim found: Nonce ${nonce} has ${permits.length} permits, ${claimedCount} claimed`);
        for (const permit of permits) {
          console.log(`  - Permit ${permit.id}: ${permit.transaction ? 'CLAIMED' : 'UNCLAIMED'}, Network: ${permit.tokens?.network}`);
        }
      }
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`Total nonces with duplicates: ${duplicateCount}`);
}