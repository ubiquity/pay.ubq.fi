#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Check permit 1769 with joins
const { data, error } = await supabase
  .from("permits")
  .select(
    `
    id,
    nonce,
    transaction,
    amount,
    beneficiary_id,
    partner_id,
    token_id,
    tokens(
      network,
      address
    ),
    partners(
      id,
      wallets(
        address
      )
    ),
    locations(
      node_url
    )
  `
  )
  .eq("id", 1769);

console.log("Permit 1769 details:");
console.log(JSON.stringify(data, null, 2));
if (error) console.error("Error:", error);