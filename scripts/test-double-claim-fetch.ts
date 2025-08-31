#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/frontend/src/database.types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

console.log("Checking specific nonce 35205825218713176781923704351315377070369795007350107662811700128250561551111");

const { data, error } = await supabase
  .from("permits")
  .select("id, nonce, transaction, amount, created")
  .eq("nonce", "35205825218713176781923704351315377070369795007350107662811700128250561551111");

if (error) {
  console.error("Error:", error);
} else {
  console.log("Found permits:", data);
}