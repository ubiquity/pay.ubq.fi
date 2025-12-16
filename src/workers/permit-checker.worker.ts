import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import { type Address } from "viem";
import { RPC_URL } from "../constants/config.ts";
import type { Database } from "../database.types.ts"; // Import generated types
import type { AllowanceAndBalance, PermitData } from "../types.ts";
import { fetchPermitsFromDb, mapDbPermitToPermitData, validatePermitsBatch } from "./permit-checker.logic.ts";

// --- Worker Setup ---

export type WorkerRequest =
  | { type: "INIT"; payload: { supabaseUrl: string; supabaseAnonKey: string } }
  | { type: "FETCH_NEW_PERMITS"; payload: { address: Address; lastCheckTimestamp?: string | null } };

export type WorkerResponse =
  | { type: "INIT_SUCCESS" }
  | { type: "INIT_ERROR"; error: string }
  | { type: "NEW_PERMITS_VALIDATED"; permits: PermitData[]; balancesAndAllowances: Map<string, AllowanceAndBalance> }
  | { type: "PERMITS_ERROR"; error: string };

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
    const lastCheckTimestamp = payload.lastCheckTimestamp;
    try {
      if (!supabase) throw new Error("Supabase client not ready.");
      if (!rpcClient) throw new Error("RPC client not ready.");
      const lowerCaseWalletAddress = address.toLowerCase();

      // Fetch *only new* permits from DB using the wallet address and timestamp
      const newPermitsFromDb = await fetchPermitsFromDb({
        supabaseClient: supabase,
        walletAddress: lowerCaseWalletAddress,
        lastCheckTimestamp: lastCheckTimestamp ?? null,
      });

      // 3. Map and pre-filter *new* permits
      const mappedNewPermits = (
        await Promise.all(newPermitsFromDb.map((permit, index) => mapDbPermitToPermitData({ permit, index, lowerCaseWalletAddress })))
      ).filter((p): p is PermitData => p !== null);
      // One-line summary for mapped permits
      console.log(`Worker: Mapped ${mappedNewPermits.length} new permits`);

      // 4. Validate *only* the mapped new permits
      if (mappedNewPermits.length > 0) {
        const validatedNewPermits = await validatePermitsBatch({ rpcClient, permitsToValidate: mappedNewPermits });
        worker.postMessage({
          type: "NEW_PERMITS_VALIDATED",
          permits: validatedNewPermits.permits,
          balancesAndAllowances: validatedNewPermits.balancesAndAllowances,
        });
      } else {
        // If no new permits were found, still send back an empty array for consistency
        worker.postMessage({ type: "NEW_PERMITS_VALIDATED", permits: [], balancesAndAllowances: new Map() });
      }
    } catch (error: unknown) {
      console.error("Worker: Error fetching/validating new permits:", error);
      worker.postMessage({ type: "PERMITS_ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  }
};
