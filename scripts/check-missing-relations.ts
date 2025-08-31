#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

console.log("Checking permits 1488 and 1769 for missing relationships...\n");

// Check permits with minimal joins
for (const permitId of [1488, 1769]) {
  console.log(`--- Permit ${permitId} ---`);
  
  const { data: permit, error } = await supabase
    .from("permits")
    .select("id, nonce, transaction, partner_id, token_id")
    .eq("id", permitId)
    .single();

  if (error) {
    console.error(`Error fetching permit ${permitId}:`, error);
    continue;
  }

  console.log(`Basic data:`, permit);

  // Check token relationship
  if (permit.token_id) {
    const { data: token } = await supabase
      .from("tokens")
      .select("*")
      .eq("id", permit.token_id)
      .single();
    console.log(`Token:`, token);
  }

  // Check partner relationship
  if (permit.partner_id) {
    const { data: partner } = await supabase
      .from("partners")
      .select("id, wallet_id, wallets(address)")
      .eq("id", permit.partner_id)
      .single();
    console.log(`Partner:`, partner);
  }

  // Try the full join query for this specific permit
  const { data: fullJoin, error: fullJoinError } = await supabase
    .from("permits")
    .select(`
      id,
      nonce,
      tokens(network, address),
      partners(wallets(address))
    `)
    .eq("id", permitId);

  console.log(`Full join result:`, fullJoin);
  if (fullJoinError) console.error(`Full join error:`, fullJoinError);
  
  console.log("");
}