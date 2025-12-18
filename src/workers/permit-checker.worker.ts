import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import { type Address } from "viem";
import { RPC_URL } from "../constants/config.ts";
import type { Database } from "../database.types.ts"; // Import generated types
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { fetchPermitsFromDb, mapDbPermitToPermitData, type PermitRow, validatePermitsBatch } from "./permit-checker.logic.ts";

type PermitRowWithBeneficiary = PermitRow & {
  users?: {
    wallets?: {
      address?: string | null;
    } | null;
  } | null;
};

// --- Worker Setup ---

export type WorkerRequest =
  | { type: "INIT"; payload: { supabaseUrl: string; supabaseAnonKey: string } }
  | { type: "FETCH_NEW_PERMITS"; payload: { address: Address; requestId: number; lastCheckTimestamp?: string | null } };

export type WorkerResponse =
  | { type: "INIT_SUCCESS" }
  | { type: "INIT_ERROR"; error: string }
  | {
      type: "NEW_PERMITS_VALIDATED";
      requestId: number;
      address: Address;
      permits: PermitData[];
      balancesAndAllowances: Map<string, AllowanceAndBalance>;
    }
  | { type: "PERMITS_ERROR"; requestId: number; address: Address; error: string };

// Define the worker scope type
interface WorkerGlobalScope extends Worker {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: WorkerResponse) => void;
}

// Use the worker global scope
const worker: WorkerGlobalScope = self as unknown as WorkerGlobalScope;

// Initialize Supabase & RPC clients (will be set in INIT)
let supabase: SupabaseClient<Database> | null = null; // Use Database type
let rpcClient: ReturnType<typeof createRpcClient> | null = null;
// --- Worker Message Handling ---

worker.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === "INIT") {
    const supabaseUrl = payload.supabaseUrl;
    const supabaseAnonKey = payload.supabaseAnonKey;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        supabase = createClient<Database>(supabaseUrl, supabaseAnonKey); // Use Database type
        rpcClient = createRpcClient({ baseUrl: RPC_URL }); // Init RPC client here
        worker.postMessage({ type: "INIT_SUCCESS" });
      } catch (error: unknown) {
        console.error("Worker: Error initializing clients:", error);
        worker.postMessage({ type: "INIT_ERROR", error: error instanceof Error ? error.message : String(error) });
      }
    } else {
      worker.postMessage({ type: "INIT_ERROR", error: "Supabase/RPC credentials not received by worker." });
    }
  } else if (type === "FETCH_NEW_PERMITS") {
    const address = payload.address as Address;
    const requestId = Number((payload as { requestId?: unknown }).requestId);
    const lastCheckTimestamp = payload.lastCheckTimestamp;
    try {
      if (!supabase) throw new Error("Supabase client not ready.");
      if (!rpcClient) throw new Error("RPC client not ready.");
      const supabaseClient = supabase;
      const rpc = rpcClient;
      const connectedWalletAddress = address.toLowerCase();

      // Fetch permits where the connected wallet is the beneficiary (claiming)
      const beneficiaryPermitsFromDb = (await fetchPermitsFromDb({
        supabaseClient,
        walletAddress: connectedWalletAddress,
        lastCheckTimestamp: lastCheckTimestamp ?? null,
      })) as PermitRowWithBeneficiary[];

      // Fetch permits where the connected wallet is the owner (invalidation)
      const ownerJoinQuery = `
              *,
              token:tokens(address, network),
              partner:partners!inner(wallet:wallets!inner(address)),
              location:locations(node_url),
              users!inner(
                  wallets!inner(address)
              )
    `;

      const buildOwnerQuery = () => {
        let query = supabaseClient
          .from("permits")
          .select(ownerJoinQuery)
          .is("transaction", null)
          .filter("partner.wallet.address", "ilike", connectedWalletAddress);

        if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
          query = query.gt("created", lastCheckTimestamp);
        }

        return query;
      };

      const pageSize = 1000;
      const ownerPermitsFromDb: PermitRowWithBeneficiary[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const result = await buildOwnerQuery()
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (result.error) {
          console.error(`Worker: owner query error: ${result.error.message}`, result.error);
          throw new Error(`Worker: owner query error: ${result.error.message}`);
        }

        const page = (result.data ?? []) as PermitRowWithBeneficiary[];
        if (page.length === 0) break;

        ownerPermitsFromDb.push(...page);
        if (page.length < pageSize) break;
      }

      const permitMap = new Map<number, PermitRowWithBeneficiary>();
      beneficiaryPermitsFromDb.forEach((permit) => permitMap.set(permit.id, permit));
      ownerPermitsFromDb.forEach((permit) => {
        if (permitMap.has(permit.id)) {
          console.warn(
            `Worker: Permit ID ${permit.id} found in both beneficiary and owner queries for wallet ${connectedWalletAddress}. ` +
              "This suggests a data inconsistency or unexpected query behavior."
          );
        }
        permitMap.set(permit.id, permit);
      });

      if (ownerPermitsFromDb.length > 0) {
        console.log(`Worker: Found ${ownerPermitsFromDb.length} permits as owner`);
      }

      // Map and pre-filter permits
      const mappedNewPermits = (
        await Promise.all(
          Array.from(permitMap.values()).map(async (permit, index) => {
            const beneficiaryWalletAddress = permit.users?.wallets?.address;
            if (!beneficiaryWalletAddress) {
              console.warn(`Worker: Permit ${permit.id} missing beneficiary wallet address; skipping`);
              return null;
            }
            const beneficiaryAddress = String(beneficiaryWalletAddress).toLowerCase();
            const mapped = await mapDbPermitToPermitData({ permit, index, lowerCaseWalletAddress: beneficiaryAddress });
            if (mapped) mapped.beneficiaryUserId = permit.beneficiary_id;
            return mapped;
          })
        )
      ).filter((p): p is PermitData => p !== null);

      console.log(`Worker: Mapped ${mappedNewPermits.length} new permits`);

      // 4. Validate *only* the mapped new permits
      if (mappedNewPermits.length > 0) {
        const validatedNewPermits = await validatePermitsBatch({ rpcClient: rpc, permitsToValidate: mappedNewPermits });
        worker.postMessage({
          type: "NEW_PERMITS_VALIDATED",
          requestId,
          address,
          permits: validatedNewPermits.permits,
          balancesAndAllowances: validatedNewPermits.balancesAndAllowances,
        });
      } else {
        // If no new permits were found, still send back an empty array for consistency
        worker.postMessage({ type: "NEW_PERMITS_VALIDATED", requestId, address, permits: [], balancesAndAllowances: new Map() });
      }
    } catch (error: unknown) {
      console.error("Worker: Error fetching/validating new permits:", error);
      worker.postMessage({ type: "PERMITS_ERROR", requestId, address, error: error instanceof Error ? error.message : String(error) });
    }
  }
};
