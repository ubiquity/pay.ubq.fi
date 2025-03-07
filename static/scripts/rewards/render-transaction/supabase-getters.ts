import { createClient } from "@supabase/supabase-js";
import { Database, type PermitReward } from "@ubiquity-os/permit-generation";
import { TokenType } from "@ubiquibot/permit-generation/types";
import { toaster } from "../toaster";
import { BigNumber, BigNumberish } from "ethers";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment");
}
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface SupabasePermit {
  id: number;
  nonce: string;
  amount: string;
  deadline: string;
  signature: string;
  transaction: string | null;
  token_id: number | null;
  beneficiary_id: number | null;
  partner_id: number | null;
}

export interface SupabaseToken {
  id: number;
  address: string;
  network: number;
}

export interface SupabasePartner {
  id: number;
  wallet_id: number;
}

export interface SupabaseUser {
  id: number;
  wallet_id: number;
}

export interface SupabaseWallet {
  id: number;
  address: string;
}

export async function fetchTokenById(tokenId: number): Promise<SupabaseToken | null> {
  const { data, error } = await supabase.from("tokens").select("*").eq("id", tokenId).single();
  if (error) {
    console.error("error fetching token:", error);
    return null;
  }
  return data as SupabaseToken;
}

export async function fetchUserById(userId: number): Promise<SupabaseUser | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
  if (error) {
    console.error("error fetching user:", error);
    return null;
  }
  return data as SupabaseUser;
}

export async function fetchPartnerById(partnerId: number): Promise<SupabasePartner | null> {
  const { data, error } = await supabase.from("partners").select("*").eq("id", partnerId).single();
  if (error) {
    console.error("error fetching partner:", error);
    return null;
  }
  return data as SupabasePartner;
}

export async function fetchWalletById(walletId: number): Promise<SupabaseWallet | null> {
  const { data, error } = await supabase.from("wallets").select("*").eq("id", walletId).single();
  if (error) {
    console.error("error fetching wallet:", error);
    return null;
  }
  return data as SupabaseWallet;
}

export async function fetchPermitsFromSupabase(userId: number): Promise<PermitReward[]> {
  const { data, error } = await supabase.from("permits").select("*").eq("beneficiary_id", userId).order("id", { ascending: false });
  if (error) {
    console.error("error fetching permits:", error);
    toaster.create("error", "failed to fetch permits from supabase.");
    return [];
  }
  if (!data) return [];

  return processPermits(data as SupabasePermit[]);
}

async function processPermits(permits: SupabasePermit[]): Promise<PermitReward[]> {
  const processed = await Promise.all(
    permits.map(async (permit) => {
      if (!permit.beneficiary_id || !permit.token_id || !permit.partner_id) {
        // skip if not enough info from db
        return null;
      }

      // fetch objects from db
      const userRecord = await fetchUserById(permit.beneficiary_id);
      if (!userRecord) {
        console.log("user not found");
        return null;
      }

      const tokenRecord = await fetchTokenById(permit.token_id);
      const userWalletRecord = await fetchWalletById(userRecord.wallet_id);
      const partnerRecord = await fetchPartnerById(permit.partner_id);
      if (!partnerRecord) {
        console.log("partner not found");
        return null;
      }

      const partnerWalletRecord = await fetchWalletById(partnerRecord.wallet_id);
      if (!tokenRecord || !userWalletRecord || !partnerWalletRecord) {
        console.log("token or wallet not found");
        return null;
      }

      return {
        nonce: permit.nonce,
        amount: permit.amount,
        deadline: permit.deadline,
        signature: permit.signature,
        tokenType: TokenType.ERC20,
        tokenAddress: tokenRecord.address,
        beneficiary: userWalletRecord.address,
        owner: partnerWalletRecord.address,
        networkId: tokenRecord.network,
      } as PermitReward;
    })
  );

  const validPermits = processed.filter((permit): permit is PermitReward => permit !== null);

  // deduplicate by nonce using highest amount
  const permitMap = new Map<BigNumberish, PermitReward>();
  for (const permit of validPermits) {
    if (!permit.nonce) continue;

    const current = permitMap.get(permit.nonce);
    if (!current) {
      permitMap.set(permit.nonce, permit);
    } else {
      const oldAmount = BigNumber.from(current.amount);
      const newAmount = BigNumber.from(permit.amount);
      if (newAmount.gt(oldAmount)) {
        permitMap.set(permit.nonce, permit);
      }
    }
  }

  return Array.from(permitMap.values());
}
