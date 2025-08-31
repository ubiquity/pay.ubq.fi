#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

console.log("Debugging Supabase query limits and joins...\n");

// Test 1: Simple query without joins
console.log("=== Test 1: Simple query without joins ===");
const { data: simpleData, error: simpleError } = await supabase
  .from("permits")
  .select("id, nonce, transaction")
  .limit(1800)
  .order('id', { ascending: true });

console.log(`Simple query results: ${simpleData?.length} permits`);
if (simpleData && simpleData.length > 0) {
  const maxId = Math.max(...simpleData.map(p => p.id));
  console.log(`Max ID in simple query: ${maxId}`);
  const has1488 = simpleData.some(p => p.id === 1488);
  const has1769 = simpleData.some(p => p.id === 1769);
  console.log(`Has permit 1488: ${has1488}, Has permit 1769: ${has1769}`);
}

// Test 2: Query with joins but no limit
console.log("\n=== Test 2: Query with joins but no explicit limit ===");
const { data: joinData, error: joinError } = await supabase
  .from("permits")
  .select(`
    id,
    nonce,
    transaction,
    tokens(network, address),
    partners(wallets(address))
  `)
  .order('id', { ascending: true });

console.log(`Join query results: ${joinData?.length} permits`);
if (joinData && joinData.length > 0) {
  const maxId = Math.max(...joinData.map(p => p.id));
  console.log(`Max ID in join query: ${maxId}`);
  const has1488 = joinData.some(p => p.id === 1488);
  const has1769 = joinData.some(p => p.id === 1769);
  console.log(`Has permit 1488: ${has1488}, Has permit 1769: ${has1769}`);
}

// Test 3: Check specifically around the boundary
console.log("\n=== Test 3: Permits around ID 1320-1330 ===");
const { data: boundaryData, error: boundaryError } = await supabase
  .from("permits")
  .select("id, nonce, transaction, partner_id, token_id")
  .gte('id', 1320)
  .lte('id', 1330)
  .order('id', { ascending: true });

console.log(`Boundary permits:`, boundaryData);

// Test 4: Check if permits 1488 and 1769 have partner/token relationships
console.log("\n=== Test 4: Check relationships for permits 1488, 1769 ===");
const { data: testPermits } = await supabase
  .from("permits")
  .select("id, nonce, transaction, partner_id, token_id")
  .in('id', [1488, 1769]);

console.log(`Test permits raw data:`, testPermits);

if (testPermits) {
  for (const permit of testPermits) {
    // Check partner relationship
    if (permit.partner_id) {
      const { data: partner } = await supabase
        .from("partners")
        .select("id, wallet_id")
        .eq("id", permit.partner_id)
        .single();
      console.log(`Permit ${permit.id} partner:`, partner);
      
      if (partner?.wallet_id) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("id, address")
          .eq("id", partner.wallet_id)
          .single();
        console.log(`Permit ${permit.id} wallet:`, wallet);
      }
    }
    
    // Check token relationship
    if (permit.token_id) {
      const { data: token } = await supabase
        .from("tokens")
        .select("id, network, address")
        .eq("id", permit.token_id)
        .single();
      console.log(`Permit ${permit.id} token:`, token);
    }
  }
}