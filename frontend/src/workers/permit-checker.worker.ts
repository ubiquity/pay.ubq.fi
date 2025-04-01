import { type Address, type Abi, parseAbiItem } from "viem";
import type { PermitData } from "../types";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from '@ubiquity-dao/permit2-rpc-client';
import { encodeFunctionData } from "viem";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils";
import type { Database, Tables } from "../database.types"; // Import generated types

// --- Worker Setup ---

// Define table names
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";
// Removed unused: const USERS_TABLE = "users";

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

// Initialize Supabase & RPC clients (will be set in INIT)
let supabase: SupabaseClient<Database> | null = null; // Use Database type
let rpcClient: ReturnType<typeof createRpcClient> | null = null;
let PROXY_BASE_URL = ""; // Will be set in INIT

// Define type for JSON-RPC Request object
interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
    id: number | string;
}

// Define expected message structure more specifically if possible
interface WorkerPayload {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    address?: Address;
    lastCheckTimestamp?: string | null;
    permits?: PermitData[]; // For VALIDATE_PERMITS
    proxyBaseUrl?: string; // Pass proxy URL during init
    [key: string]: unknown;
}

// --- Database Fetching and Mapping ---

// Type alias for permits row using generated types
type PermitRow = Tables<'permits'> & {
    token: Tables<'tokens'> | null;
    partner: (Tables<'partners'> & { wallet: Tables<'wallets'> | null }) | null;
    location: Tables<'locations'> | null;
};


// Function to map DB result to PermitData (ERC20 only focus)
function mapDbPermitToPermitData(permit: PermitRow, index: number, lowerCaseWalletAddress: string): PermitData | null {
    const tokenData = permit.token;
    const ownerWalletData = permit.partner?.wallet;
    const ownerAddressStr = ownerWalletData?.address ? String(ownerWalletData.address) : "";
    const tokenAddressStr = tokenData?.address ? String(tokenData.address) : undefined;
    const networkIdNum = Number(tokenData?.network ?? 0);
    const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

    // Assume ERC20 if amount is positive, otherwise filter out.
    let type: 'erc20-permit' | null = null;
    let amountBigInt: bigint | null = null;
    if (permit.amount !== undefined && permit.amount !== null) {
        try {
            amountBigInt = BigInt(permit.amount);
        } catch {
            console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid amount format: ${permit.amount}`);
            amountBigInt = null;
        }
    }

    if (amountBigInt !== null && amountBigInt > 0n) {
        type = "erc20-permit";
    } else {
        // Allow permits with 0 amount through mapping, filter later if needed
        // if (index < 10) { console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has no positive amount (${permit.amount}). Filtering out.`); }
        // return null;
        type = "erc20-permit"; // Still classify as ERC20 if amount is 0 or null, maybe filter later based on validation?
    }

    // Log type determination for the first few permits
    if (index < 10) {
        // console.log(`Worker: Permit [${index}] mapped. Raw: {amount: ${permit.amount}}. Determined type: ${type}`);
    }

    const permitData: PermitData = {
        nonce: String(permit.nonce),
        networkId: networkIdNum,
        beneficiary: lowerCaseWalletAddress, // Keep wallet address as beneficiary for UI/logic consistency
        deadline: String(permit.deadline),
        signature: String(permit.signature),
        type: type,
        owner: ownerAddressStr,
        tokenAddress: tokenAddressStr,
        token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
        amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
        token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
        githubCommentUrl: githubUrlStr,
        partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined,
        claimStatus: "Idle",
        ...(permit.created && { created_at: permit.created }) // Map 'created' from DB
    };

    // Basic validation (ensure essential fields are present)
    if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || !permitData.token?.address) { // Amount check removed as 0 is ok for type
        if (index < 10) { console.warn(`Worker: Permit [${index}] missing essential data. Filtering out. Data:`, JSON.stringify(permitData)); }
        return null;
    }
    // Validate deadline format before parsing
     if (typeof permitData.deadline !== 'string' || isNaN(parseInt(permitData.deadline, 10))) {
         if (index < 10) { console.warn(`Worker: Permit [${index}] has invalid deadline format: ${permitData.deadline}. Filtering out.`); }
         return null;
     }
    const deadlineInt = parseInt(permitData.deadline, 10);
    if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
        if (index < 10) { console.warn(`Worker: Permit [${index}] is expired. Filtering out.`); }
        return null;
    }
    return permitData;
}

// Function to fetch permits from Supabase - uses github_id string for beneficiary_id
async function fetchPermitsFromDb(userGitHubId: string, lastCheckTimestamp: string | null): Promise<PermitRow[]> {
    if (!supabase) throw new Error("Supabase client not initialized.");

    // console.log(`Worker: Querying permits for github_id ${userGitHubId} created after: ${lastCheckTimestamp || 'Beginning of time'}`);
    let query = supabase.from(PERMITS_TABLE)
        .select(`*, created, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: ${LOCATIONS_TABLE} (node_url)`)
        // IMPORTANT: Using github_id (string) for beneficiary_id (number in generated type) based on observed behavior
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("beneficiary_id", userGitHubId as any) // Use 'as any' to bypass incorrect generated type & suppress ESLint warning
        .is("transaction", null);

    if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
        query = query.gt('created', lastCheckTimestamp); // Use the correct column name 'created'
    } else if (lastCheckTimestamp) {
        console.warn(`Worker: Received invalid lastCheckTimestamp: ${lastCheckTimestamp}. Fetching all permits.`);
    }

    const { data: potentialPermitsData, error: permitError } = await query;

    if (permitError) throw new Error(`Supabase permit fetch error: ${permitError.message}`);

    if (!potentialPermitsData || potentialPermitsData.length === 0) {
        // console.log(`Worker: No potential permits found for github_id ${userGitHubId}` + (lastCheckTimestamp ? ` since ${lastCheckTimestamp}` : ''));
        return [];
    }

    // console.log(`Worker: Found ${potentialPermitsData.length} potential permits from DB` + (lastCheckTimestamp ? ` since ${lastCheckTimestamp}` : ''));
    // Cast needed because Supabase client doesn't know about the joined types automatically
    return potentialPermitsData as unknown as PermitRow[];
}

// --- On-Chain Validation ---

// Function to perform batch validation using rpcClient
async function validatePermitsBatch(permitsToValidate: PermitData[]): Promise<PermitData[]> {
    if (!rpcClient) throw new Error("RPC client not initialized.");
    if (permitsToValidate.length === 0) {
        // console.log("Worker: No permits provided for validation.");
        return [];
    }

    const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
    const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];
    let requestIdCounter = 1;
    const permitsByKey = new Map<string, PermitData>(permitsToValidate.map(p => [`${p.nonce}-${p.networkId}`, p]));

    permitsToValidate.forEach((permit) => {
        // Only handle ERC20 permits as per simplified logic
        if (permit.type !== 'erc20-permit') {
            console.warn(`Worker: Skipping validation for non-ERC20 permit: ${permit.nonce}`);
            return;
        };

        const key = `${permit.nonce}-${permit.networkId}`;
        const chainId = permit.networkId;
        const owner = permit.owner as Address;

        // Nonce Check (ERC20 only)
        const wordPos = BigInt(permit.nonce) >> 8n;
        batchRequests.push({
            request: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: "0x000000000022D473030F116dDEE9F6B43aC78BA3", data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) }, 'latest'], id: requestIdCounter++ },
            key, type: "nonce", chainId
        });

        // Balance & Allowance Checks
        if (permit.token?.address && permit.amount && permit.owner) {
            const calls = preparePermitPrerequisiteContracts(permit);
            if (calls) {
                const requiredAmount = BigInt(permit.amount);
                const [balanceCall, allowanceCall] = calls;
                batchRequests.push({
                    request: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: balanceCall.address, data: encodeFunctionData({ abi: balanceCall.abi as Abi, functionName: balanceCall.functionName, args: balanceCall.args }) }, 'latest'], id: requestIdCounter++ },
                    key, type: "balance", requiredAmount, chainId
                });
                batchRequests.push({
                    request: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: allowanceCall.address, data: encodeFunctionData({ abi: allowanceCall.abi as Abi, functionName: allowanceCall.functionName, args: allowanceCall.args }) }, 'latest'], id: requestIdCounter++ },
                    key, type: "allowance", requiredAmount, chainId
                });
            }
        } else {
             console.warn(`Worker: Skipping balance/allowance check for permit ${key} due to missing data.`);
        }
    });

    // console.log(`Worker: Sending validation batch request with ${batchRequests.length} checks.`);
    if (batchRequests.length === 0) return permitsToValidate; // Return original if nothing to check (e.g., only non-ERC20 passed)

    try {
        const batchPayload = batchRequests.map(br => br.request);
        // Assuming chainId 100 for all permits currently
        const batchResponses = await rpcClient.request(100, batchPayload) as JsonRpcResponse[];
        // console.log(`Worker: Received ${batchResponses.length} validation responses in batch.`);

        const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map(res => [res.id as number, res]));

        batchRequests.forEach(batchReq => {
            const permit = permitsByKey.get(batchReq.key);
            if (!permit) return;

            const res = responseMap.get(batchReq.request.id as number);
            // Initialize updateData with existing permit data to preserve fields not checked
            const updateData: Partial<PermitData & { isNonceUsed?: boolean }> = checkedPermitsMap.get(batchReq.key) || {};


            if (!res) {
                updateData.checkError = `Batch response missing (${batchReq.type})`;
            } else if (res.error) {
                updateData.checkError = `Check failed (${batchReq.type}). ${res.error.message}`;
            } else if (res.result !== undefined && res.result !== null) {
                try {
                    if (batchReq.type === "balance" && batchReq.requiredAmount !== undefined) updateData.ownerBalanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
                    else if (batchReq.type === "allowance" && batchReq.requiredAmount !== undefined) updateData.permit2AllowanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
                    else if (batchReq.type === "nonce") {
                        const bitmap = BigInt(res.result as string);
                        updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
                    }
                    // Clear checkError if this specific check succeeded
                    if (updateData.checkError?.includes(`(${batchReq.type})`)) {
                        updateData.checkError = undefined;
                    }
                } catch (parseError: unknown) {
                    updateData.checkError = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
                }
            } else {
                updateData.checkError = `Empty result (${batchReq.type})`;
            }
            checkedPermitsMap.set(batchReq.key, updateData);
        });

    } catch (error: unknown) {
        console.error("Worker: Error during validation batch RPC request:", error);
        // Mark all permits in this validation batch as errored
        permitsToValidate.forEach(permit => {
             const key = `${permit.nonce}-${permit.networkId}`;
             const updateData = checkedPermitsMap.get(key) || { checkError: `Batch request failed: ${error instanceof Error ? error.message : String(error)}` };
             if (!updateData.checkError) { // Don't overwrite specific check errors
                 updateData.checkError = `Batch request failed: ${error instanceof Error ? error.message : String(error)}`;
             }
             checkedPermitsMap.set(key, updateData);
        });
    }

    // Map results back onto the original permits passed in
    return permitsToValidate.map(permit => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        // Merge validation results onto the permit data
        return checkData ? { ...permit, ...checkData } : permit;
    });
}


// --- Worker Message Handling ---

self.onmessage = async (event: MessageEvent<{ type: 'INIT' | 'FETCH_NEW_PERMITS' | 'VALIDATE_PERMITS'; payload: WorkerPayload }>) => {
    const { type, payload } = event.data;

    if (type === 'INIT') {
        const supabaseUrl = payload.supabaseUrl;
        const supabaseAnonKey = payload.supabaseAnonKey;
        PROXY_BASE_URL = payload.proxyBaseUrl || "https://rpc.ubq.fi"; // Use passed URL or default

        if (supabaseUrl && supabaseAnonKey) {
            try {
                supabase = createClient<Database>(supabaseUrl, supabaseAnonKey); // Use Database type
                rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL }); // Init RPC client here
                // console.log("Worker: Supabase and RPC clients initialized.");
                self.postMessage({ type: 'INIT_SUCCESS' });
            } catch (error: unknown) {
                console.error("Worker: Error initializing clients:", error);
                self.postMessage({ type: 'INIT_ERROR', error: error instanceof Error ? error.message : String(error) });
            }
        } else {
            self.postMessage({ type: 'INIT_ERROR', error: 'Supabase/RPC credentials not received by worker.' });
        }
    } else if (type === 'FETCH_NEW_PERMITS') {
        const address = payload.address as Address;
        const lastCheckTimestamp = payload.lastCheckTimestamp;
        // console.log(`Worker: Received FETCH_NEW_PERMITS for ${address}`);
        try {
            if (!supabase) throw new Error("Supabase client not ready.");
            // 1. Find github_id from permit_app_users table
            const lowerCaseWalletAddress = address.toLowerCase();
            // Use ilike for case-insensitive comparison
            const { data: userData, error: userFetchError } = await supabase.from("permit_app_users").select("github_id").ilike("wallet_address", lowerCaseWalletAddress).single();
            if (userFetchError && userFetchError.code !== 'PGRST116') throw new Error(`Supabase user fetch error: ${userFetchError.message}`);
            if (!userData) {
                // console.log(`Worker: No user found in permit_app_users for wallet ${lowerCaseWalletAddress}`);
                // Send empty array as no user means no permits
                self.postMessage({ type: 'NEW_PERMITS_VALIDATED', permits: [] }); // Use the correct response type
                return;
            }
            const userGitHubId = userData.github_id; // This is the string github_id

            // 2. Fetch *only new* permits from DB using the github_id string and timestamp
            const newPermitsFromDb = await fetchPermitsFromDb(userGitHubId, lastCheckTimestamp ?? null); // Correct function name used

            // 3. Map and pre-filter *new* permits
            // Add explicit types to map parameters
            const mappedNewPermits = newPermitsFromDb.map((p: PermitRow, i: number) => mapDbPermitToPermitData(p, i, lowerCaseWalletAddress)).filter((p): p is PermitData => p !== null);
            // console.log(`Worker: Mapped ${mappedNewPermits.length} new permits.`);

            // 4. Validate *only* the mapped new permits
            if (mappedNewPermits.length > 0) {
                const validatedNewPermits = await validatePermitsBatch(mappedNewPermits);
                self.postMessage({ type: 'NEW_PERMITS_VALIDATED', permits: validatedNewPermits });
            } else {
                // If no new permits were found, still send back an empty array for consistency
                self.postMessage({ type: 'NEW_PERMITS_VALIDATED', permits: [] });
            }

        } catch (error: unknown) {
            console.error("Worker: Error fetching/validating new permits:", error);
            self.postMessage({ type: 'PERMITS_ERROR', error: error instanceof Error ? error.message : String(error) });
        }
    } else if (type === 'VALIDATE_PERMITS') { // This message type might become obsolete with the new flow, but keep for now? Or remove? Let's remove for now.
       // This case is handled internally now after fetching new permits.
       console.warn("Worker: Received unexpected VALIDATE_PERMITS message.");
       // Optionally handle if needed, otherwise ignore.
    }
};

// console.log("Permit checker worker started.");
