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

export interface SupabaseWallet {
  id: number;
  address: string | null;
}

export async function fetchPermitsFromSupabase(userId: number): Promise<PermitReward[]> {
  const { data, error } = await supabase.from("permits").select("*").eq("beneficiary_id", userId).is("transaction", null).order("id", { ascending: false });
  if (error) {
    console.error("error fetching permits:", error);
    toaster.create("error", "Failed to fetch permits from Supabase.");
    return [];
  }
  if (!data) return [];
  console.log("raw permits", data);

  // fetch user data once
  const { data: userData, error: userError } = await supabase.from("users").select("*, wallets(*)").eq("id", userId).single();

  if (userError || !userData) {
    console.error("error fetching user or wallet:", userError);
    return [];
  }

  const userWalletRecord = userData.wallets as SupabaseWallet;
  if (!userWalletRecord) {
    console.error("user wallet not found for id:", userData.wallet_id);
    return [];
  }

  return processPermits(data as SupabasePermit[], userWalletRecord);
}

async function processPermits(permits: SupabasePermit[], userWalletRecord: SupabaseWallet): Promise<PermitReward[]> {
  const caches = await fetchCaches(permits);
  if (!caches) return [];

  const processed = processPermitRecords(permits, userWalletRecord, caches);
  const missingPermits = permits.filter((permit) => !processed.some((processedPermit) => processedPermit.nonce === permit.nonce));
  console.log("excluded permits (missing data)", missingPermits);
  return deduplicatePermits(processed);
}

async function fetchCaches(permits: SupabasePermit[]): Promise<{
  tokenCache: Map<number, SupabaseToken>;
  partnerCache: Map<number, SupabasePartner>;
  walletCache: Map<number, SupabaseWallet>;
} | null> {
  try {
    const tokenIds = [...new Set(permits.map((p) => p.token_id).filter((id): id is number => id !== null))];
    const partnerIds = [...new Set(permits.map((p) => p.partner_id).filter((id): id is number => id !== null))];

    // fetch tokens and partners concurrently
    const [tokensResponse, partnersResponse] = await Promise.all([
      supabase.from("tokens").select("*").in("id", tokenIds),
      supabase.from("partners").select("*, wallets(*)").in("id", partnerIds),
    ]);

    if (tokensResponse.error) throw new Error(`Error fetching tokens: ${tokensResponse.error.message}`);
    if (partnersResponse.error) throw new Error(`Error fetching partners: ${partnersResponse.error.message}`);

    const tokenCache = new Map<number, SupabaseToken>(tokensResponse.data?.map((t) => [t.id, t]) ?? []);

    const partnerCache = new Map<number, SupabasePartner>();
    const walletCache = new Map<number, SupabaseWallet>();

    // process partners and their joined wallet data
    partnersResponse.data?.forEach((partner) => {
      partnerCache.set(partner.id, partner);
      if (partner.wallet_id && partner.wallets) {
        walletCache.set(partner.wallet_id, partner.wallets as SupabaseWallet);
      }
    });

    return { tokenCache, partnerCache, walletCache };
  } catch (error) {
    console.error("Error in fetchCaches:", error);
    return null;
  }
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
