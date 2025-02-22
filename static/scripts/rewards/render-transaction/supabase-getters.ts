import { createClient } from "@supabase/supabase-js";
import type { PermitReward } from "@ubiquity-os/permit-generation";
import { TokenType } from "@ubiquibot/permit-generation/types";
import { toaster } from "../toaster";
import { BigNumber } from "ethers";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const query = `
      query {
        tokensCollection(filter: { id: { eq: ${tokenId} } }) {
          edges {
            node {
              id
              address
              network
            }
          }
        }
      }
    `;

  try {
    const response = await fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ query }),
    });

    const { data, errors } = await response.json();
    if (errors) {
      console.error("GraphQL errors fetching token:", errors);
      return null;
    }

    const nodes = data?.tokensCollection?.edges || [];
    if (!nodes.length) {
      return null;
    }
    // return the first token node
    return nodes[0].node as SupabaseToken;
  } catch (error) {
    console.error("Error fetching token from Supabase:", error);
    return null;
  }
}

export async function fetchUserById(userId: number): Promise<SupabaseUser | null> {
  const query = `
        query {
            usersCollection(filter: { id: { eq: ${userId} } }) {
                edges {
                    node {
                        id
                        wallet_id
                    }
                }
            }
        }
    `;

  try {
    const response = await fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ query }),
    });

    const { data, errors } = await response.json();
    if (errors) {
      console.error("GraphQL errors fetching user:", errors);
      return null;
    }

    const nodes = data?.usersCollection?.edges || [];
    if (!nodes.length) {
      return null;
    }
    // return the first user node
    return nodes[0].node as SupabaseUser;
  } catch (error) {
    console.error("Error fetching user from Supabase:", error);
    return null;
  }
}

export async function fetchPartnerById(partnerId: number): Promise<SupabasePartner | null> {
  const query = `
      query {
        partnersCollection(filter: { id: { eq: ${partnerId} } }) {
          edges {
            node {
              id
              wallet_id
            }
          }
        }
      }
    `;

  try {
    const response = await fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ query }),
    });

    const { data, errors } = await response.json();
    if (errors) {
      console.error("GraphQL errors fetching partner:", errors);
      return null;
    }

    const nodes = data?.partnersCollection?.edges || [];
    if (!nodes.length) {
      return null;
    }
    // return the first partner node
    return nodes[0].node as SupabasePartner;
  } catch (error) {
    console.error("Error fetching partner from Supabase:", error);
    return null;
  }
}

export async function fetchWalletById(walletId: number): Promise<SupabaseWallet | null> {
  const query = `
      query {
        walletsCollection(filter: { id: { eq: ${walletId} } }) {
          edges {
            node {
              id
              address
            }
          }
        }
      }
    `;

  try {
    const response = await fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ query }),
    });

    const { data, errors } = await response.json();
    if (errors) {
      console.error("GraphQL errors fetching wallet:", errors);
      return null;
    }

    const nodes = data?.walletsCollection?.edges || [];
    if (!nodes.length) {
      return null;
    }
    // return the first wallet node
    return nodes[0].node as SupabaseWallet;
  } catch (error) {
    console.error("Error fetching wallet from Supabase:", error);
    return null;
  }
}

export async function fetchPermitsFromSupabase(userId: number): Promise<PermitReward[]> {
  const query = `
      query {
        permitsCollection(filter: { beneficiary_id: { eq: ${userId} } }) {
          edges{
            node{
              id
              nonce
              amount
              deadline
              signature
              token_id
              beneficiary_id
              partner_id
            }
          }
        }
      }
    `;

  try {
    const response = await fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ query }),
    });

    const { data, errors } = await response.json();

    if (errors) {
      console.error("GraphQL errors:", errors);
      toaster.create("error", "Failed to fetch permits from Supabase.");
      return [];
    }

    // process permits and fetch token info if needed
    return processPermits(data.permitsCollection.edges.map((edge: { node: SupabasePermit }) => edge.node));
  } catch (error) {
    console.error("Error fetching permits from Supabase:", error);
    return [];
  }
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
        console.log("User not found");
        return null;
      }

      const tokenRecord = await fetchTokenById(permit.token_id);
      const userWalletRecord = await fetchWalletById(userRecord.wallet_id);
      const partnerRecord = await fetchPartnerById(permit.partner_id);
      if (!partnerRecord) {
        console.log("Partner not found");
        return null;
      }

      const partnerWalletRecord = await fetchWalletById(partnerRecord.wallet_id);
      if (!tokenRecord || !userWalletRecord || !partnerWalletRecord) {
        console.log("Token or wallet not found");
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

  // deduplicate by signature using highest nonce
  const permitMap = new Map<string, PermitReward>();
  for (const permit of validPermits) {
    if (!permit.signature) continue;

    const current = permitMap.get(permit.signature);
    if (!current) {
      permitMap.set(permit.signature, permit);
    } else {
      const oldNonce = BigNumber.from(current.nonce);
      const newNonce = BigNumber.from(permit.nonce);
      if (newNonce.gt(oldNonce)) {
        permitMap.set(permit.signature, permit);
      }
    }
  }

  return Array.from(permitMap.values());
}
