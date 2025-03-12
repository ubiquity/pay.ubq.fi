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
  wallet_id: number | null;
  created?: string;
  updated?: string | null;
  location_id?: number | null;
}

export interface SupabaseUser {
  id: number;
  wallet_id: number;
}

export interface SupabaseWallet {
  id: number;
  address: string | null;
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

  // fetch user data once
  const userRecord = await fetchUserById(userId);
  if (!userRecord) {
    console.error("user not found for id:", userId);
    return [];
  }
  const userWalletRecord = await fetchWalletById(userRecord.wallet_id);
  if (!userWalletRecord) {
    console.error("user wallet not found for id:", userRecord.wallet_id);
    return [];
  }

  return processPermits(data as SupabasePermit[], userWalletRecord);
}

async function processPermits(permits: SupabasePermit[], userWalletRecord: SupabaseWallet): Promise<PermitReward[]> {
  const caches = await fetchCaches(permits);
  if (!caches) return [];

  const processed = processPermitRecords(permits, userWalletRecord, caches);
  return deduplicatePermits(processed);
}

async function fetchCaches(permits: SupabasePermit[]): Promise<{
  tokenCache: Map<number, SupabaseToken>;
  partnerCache: Map<number, SupabasePartner>;
  walletCache: Map<number, SupabaseWallet>;
} | null> {
  const tokenIds = [...new Set(permits.map((p) => p.token_id).filter((id): id is number => id !== null))];
  const partnerIds = [...new Set(permits.map((p) => p.partner_id).filter((id): id is number => id !== null))];

  const { data: tokensData, error: tokensError } = await supabase.from("tokens").select("*").in("id", tokenIds);
  if (tokensError) {
    console.error("error fetching tokens:", tokensError);
    return null;
  }
  const tokenCache = new Map<number, SupabaseToken>(tokensData?.map((t) => [t.id, t]) ?? []);

  const { data: partnersData, error: partnersError } = await supabase.from("partners").select("*").in("id", partnerIds);
  if (partnersError) {
    console.error("error fetching partners:", partnersError);
    return null;
  }
  const partnerCache = new Map<number, SupabasePartner>(partnersData?.map((p) => [p.id, p]) ?? []);

  const walletIds = [...new Set(partnersData?.map((p) => p.wallet_id) ?? [])];
  const { data: walletsData, error: walletsError } = await supabase.from("wallets").select("*").in("id", walletIds);
  if (walletsError) {
    console.error("error fetching wallets:", walletsError);
    return null;
  }
  const walletCache = new Map<number, SupabaseWallet>(walletsData?.map((w) => [w.id, w]) ?? []);

  return { tokenCache, partnerCache, walletCache };
}

function processPermitRecords(
  permits: SupabasePermit[],
  userWalletRecord: SupabaseWallet,
  caches: { tokenCache: Map<number, SupabaseToken>; partnerCache: Map<number, SupabasePartner>; walletCache: Map<number, SupabaseWallet> }
): PermitReward[] {
  return permits
    .map((permit) => {
      if (!permit.token_id || !permit.partner_id) return null;

      const tokenRecord = caches.tokenCache.get(permit.token_id);
      const partnerRecord = caches.partnerCache.get(permit.partner_id);
      if (!tokenRecord || !partnerRecord || partnerRecord.wallet_id === null) return null;

      const partnerWalletRecord = caches.walletCache.get(partnerRecord.wallet_id);
      if (!partnerWalletRecord) return null;

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
    .filter((permit): permit is PermitReward => permit !== null);
}

function deduplicatePermits(validPermits: PermitReward[]): PermitReward[] {
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
