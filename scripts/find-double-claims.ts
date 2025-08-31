#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

async function findDoubleClaims() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  console.log("Searching for permits with the same nonce that have been claimed multiple times...\n");

  // Fetch all permits with their transaction status
  const { data: permits, error } = await supabase
    .from("permits")
    .select(`
      id,
      nonce,
      transaction,
      amount,
      created,
      beneficiary_id,
      tokens!inner(
        network,
        address
      ),
      partners!inner(
        wallets!inner(
          address
        )
      )
    `)
    .order("nonce", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch permits: ${error.message}`);
  }

  if (!permits) {
    console.log("No permits found");
    return;
  }

  // Group permits by nonce
  const permitsByNonce = new Map<string, any[]>();
  
  for (const permit of permits) {
    const nonce = permit.nonce;
    if (!permitsByNonce.has(nonce)) {
      permitsByNonce.set(nonce, []);
    }
    permitsByNonce.get(nonce)!.push(permit);
  }

  // Find nonces that have multiple permits
  const duplicateNonces: any[] = [];
  
  for (const [nonce, permitList] of permitsByNonce.entries()) {
    if (permitList.length > 1) {
      // Check if any of them have been claimed (have a transaction)
      const claimedPermits = permitList.filter(p => p.transaction !== null);
      
      if (claimedPermits.length > 0) {
        duplicateNonces.push({
          nonce,
          totalPermits: permitList.length,
          claimedCount: claimedPermits.length,
          permits: permitList.map(p => ({
            id: p.id,
            transaction: p.transaction,
            amount: p.amount,
            created: p.created,
            owner: p.partners?.wallets?.address,
            network: p.tokens?.network,
          }))
        });
      }
    }
  }

  if (duplicateNonces.length === 0) {
    console.log("No duplicate nonces with claims found!");
  } else {
    console.log(`Found ${duplicateNonces.length} nonces with multiple permits:\n`);
    
    for (const dup of duplicateNonces) {
      console.log(`\nNonce: ${dup.nonce}`);
      console.log(`Total permits with this nonce: ${dup.totalPermits}`);
      console.log(`Claimed permits: ${dup.claimedCount}`);
      
      for (const permit of dup.permits) {
        console.log(`  - Permit ID: ${permit.id}`);
        console.log(`    Transaction: ${permit.transaction || 'NOT CLAIMED'}`);
        console.log(`    Amount: ${permit.amount}`);
        console.log(`    Owner: ${permit.owner}`);
        console.log(`    Created: ${permit.created}`);
      }
      
      // If multiple permits with same nonce are claimed, this is a double claim!
      if (dup.claimedCount > 1) {
        console.log(`\n⚠️  DOUBLE CLAIM DETECTED! ${dup.claimedCount} permits with the same nonce have been claimed!`);
        
        const claimedPermits = dup.permits.filter((p: any) => p.transaction);
        console.log(`  Transactions:`);
        for (const p of claimedPermits) {
          console.log(`    - https://gnosisscan.io/tx/${p.transaction}`);
        }
      }
    }
  }
}

findDoubleClaims().catch(console.error);