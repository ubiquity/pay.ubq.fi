import { type Address, type Abi, parseAbiItem } from "viem";
import type { PermitData } from "../types";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRpcClient, type JsonRpcResponse } from '@ubiquity-dao/permit2-rpc-client'; // Re-added createRpcClient
import { encodeFunctionData } from "viem";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils";

// --- Worker Setup ---
// Removed NFT_CONTRACT_ADDRESS constant

// Get Supabase config - In workers, import.meta.env is not directly available.
// These need to be passed from the main thread or configured differently.
// For now, assume they are somehow available (e.g., hardcoded, passed via message)
// A better approach is to pass them in the initial message from the main thread.
// Removed unused global variables:
// let SUPABASE_URL: string | undefined;
// let SUPABASE_ANON_KEY: string | undefined;

// Define table names
const USERS_TABLE = "permit_app_users";
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");
// Removed unused NFT ABI

// Initialize Supabase client within the worker scope
let supabase: SupabaseClient | null = null; // Changed back to let
const PROXY_BASE_URL = "https://rpc.ubq.fi";
const rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL }); // Re-initialize client

// Define a type for the permit object potentially augmented with _filterOut
// Removed unused: type MappedPermit = PermitData & { _filterOut?: boolean };

// Define type for JSON-RPC Request object
interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
    id: number | string; // Allow string or number ID
}

// Define expected message structure more specifically if possible
interface WorkerPayload {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    address?: Address;
    lastCheckTimestamp?: string | null; // Add timestamp field
    [key: string]: unknown; // Use unknown instead of any
}


async function fetchAndCheckPermitsForWorker(address: Address, payload: WorkerPayload) { // Accept full payload
    if (!supabase) {
        throw new Error("Supabase client not initialized in worker.");
    }
    if (!address) {
        throw new Error("Address not provided to worker.");
    }

    // Extract lastCheckTimestamp from payload (passed from main thread)
    const lastCheckTimestamp = payload?.lastCheckTimestamp;


    let initialPermits: PermitData[] = [];
    // 1. Find github_id from walletAddress
    const lowerCaseWalletAddress = address.toLowerCase();
    const { data: userData, error: userFetchError } = await supabase.from(USERS_TABLE).select("github_id").eq("wallet_address", lowerCaseWalletAddress).single();

    if (userFetchError && userFetchError.code !== 'PGRST116') {
        throw new Error(`Supabase user fetch error: ${userFetchError.message}`);
    }
    if (!userData) {
        console.log(`Worker: No user found for wallet ${lowerCaseWalletAddress}`);
        return []; // Return empty array if no user
    }
    const userGitHubId = userData.github_id;

    // 2. Find potential permits for that github_id, filtering by timestamp if available
    console.log(`Worker: Querying permits created after: ${lastCheckTimestamp || 'Beginning of time'}`);
    let query = supabase.from(PERMITS_TABLE)
        .select(`*, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: ${LOCATIONS_TABLE} (node_url)`)
        .eq("beneficiary_id", userGitHubId)
        .is("transaction", null);

    // Add timestamp filter if a valid timestamp was provided
    if (lastCheckTimestamp && !isNaN(Date.parse(lastCheckTimestamp))) {
        // Assuming 'created_at' is the timestamp column in the 'permits' table
        query = query.gt('created_at', lastCheckTimestamp);
    } else if (lastCheckTimestamp) {
        console.warn(`Worker: Received invalid lastCheckTimestamp: ${lastCheckTimestamp}. Fetching all permits.`);
    }

    const { data: potentialPermitsData, error: permitError } = await query;


    if (permitError) {
        throw new Error(`Supabase permit fetch error: ${permitError.message}`);
    }
    if (!potentialPermitsData || potentialPermitsData.length === 0) {
        console.log(`Worker: No potential permits found for github_id ${userGitHubId}` + (lastCheckTimestamp ? ` since ${lastCheckTimestamp}` : ''));
        return []; // Return empty array if no permits
    } else {
        console.log(`Worker: Found ${potentialPermitsData.length} potential permits` + (lastCheckTimestamp ? ` since ${lastCheckTimestamp}` : ''));
    }

    // 3. Map database results
    interface DbToken {
        address?: string;
        network?: number;
    }

    interface DbWallet {
        address?: string;
    }

    interface DbPartner {
        wallet?: DbWallet;
    }

    interface DbLocation {
        node_url?: string;
    }

    interface DbPermit extends Record<string, unknown> {
        nonce: string | number;
        networkId?: number;
        deadline: string | number;
        signature: string;
        amount?: string | number;
        token_id?: number | null; // Keep for potential future use, but ignore for type determination
        token?: DbToken;
        partner?: DbPartner;
        location?: DbLocation;
    }

    console.log("Worker: Starting permit mapping (assuming ERC20)..."); // Update log
    const mappedPermits = potentialPermitsData.map((permit: DbPermit, index: number): PermitData | null => { // Add index for logging
        const tokenData = permit.token || {};
        const ownerWalletData = permit.partner?.wallet || {};
        const ownerAddressStr = ownerWalletData.address ? String(ownerWalletData.address) : "";
        const tokenAddressStr = tokenData.address ? String(tokenData.address) : undefined;
        const networkIdNum = Number(permit.networkId || tokenData.network || 0);
        const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

        // Determine type: Assume ERC20 if amount is positive, otherwise filter out.
        let type: 'erc20-permit' | null = null; // Only allow ERC20 now
        let amountBigInt: bigint | null = null;
        if (permit.amount !== undefined && permit.amount !== null) {
            try {
                amountBigInt = BigInt(permit.amount as string | number);
            } catch {
                console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has invalid amount format: ${permit.amount}`);
                amountBigInt = null;
            }
        }

        if (amountBigInt !== null && amountBigInt > 0n) {
            type = "erc20-permit";
        } else {
             // If amount is not positive, filter out
             if (index < 10) {
                console.warn(`Worker: Permit [${index}] with nonce ${permit.nonce} has no positive amount (${permit.amount}). Filtering out.`);
             }
             return null;
        }

        // Log type determination for the first few permits
        if (index < 10) {
            console.log(`Worker: Permit [${index}] mapped. Raw: {amount: ${permit.amount}}. Determined type: ${type}`);
        }

        const permitData: PermitData = {
            nonce: String(permit.nonce), networkId: networkIdNum, beneficiary: lowerCaseWalletAddress,
            deadline: String(permit.deadline), signature: String(permit.signature),
            type: type, // Assign determined type (will always be 'erc20-permit' if not filtered)
            owner: ownerAddressStr, tokenAddress: tokenAddressStr,
            token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
            amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
            token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined, // Keep field even if unused for type
            githubCommentUrl: githubUrlStr, partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined,
            claimStatus: "Idle"
        };
        // Filter out permits missing essential data
        if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || !permitData.amount || !permitData.token?.address) { // Simplified check for ERC20
             if (index < 10) { // Log only first few invalid permits
                console.warn(`Worker: Permit [${index}] missing essential data after mapping. Filtering out. Data:`, JSON.stringify(permitData));
             }
             return null;
        }
        const deadlineInt = parseInt(permitData.deadline, 10);
        if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
             if (index < 10) { // Log only first few expired permits
                console.warn(`Worker: Permit [${index}] is expired (deadline: ${permitData.deadline}). Filtering out.`);
             }
             return null;
        }
        return permitData;
    }).filter((p): p is PermitData => p !== null);

    console.log(`Worker: Finished mapping. ${mappedPermits.length} permits passed initial mapping & filtering.`); // Add log

    initialPermits = mappedPermits;
    if (initialPermits.length === 0) return []; // Return early if no valid permits after mapping

    // 4. Perform frontend on-chain checks using JSON-RPC Batching (ERC20 only)
    const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
    // Use the specific JsonRpcRequest type
    const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];
    let requestIdCounter = 1; // Counter for unique JSON-RPC request IDs

    // Create a map for quick lookup of permits by key
    const permitsByKey = new Map<string, PermitData>(initialPermits.map(p => [`${p.nonce}-${p.networkId}`, p]));

    initialPermits.forEach((permit) => { // All permits here are now guaranteed ERC20
        const key = `${permit.nonce}-${permit.networkId}`;
        const chainId = permit.networkId;
        const owner = permit.owner as Address;

        // Nonce Check (ERC20 only)
        const wordPos = BigInt(permit.nonce) >> 8n;
        batchRequests.push({
            request: {
                jsonrpc: '2.0', method: 'eth_call',
                params: [{ to: "0x000000000022D473030F116dDEE9F6B43aC78BA3", data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) }, 'latest'],
                id: requestIdCounter++
            }, key, type: "nonce", chainId
        });

        // Balance & Allowance Checks (ERC20 only)
        if (permit.token?.address && permit.amount && permit.owner) { // Amount check redundant here as it's guaranteed positive
            const calls = preparePermitPrerequisiteContracts(permit);
            if (calls) {
                const requiredAmount = BigInt(permit.amount);
                const [balanceCall, allowanceCall] = calls;
                batchRequests.push({
                    request: {
                        jsonrpc: '2.0', method: 'eth_call',
                        params: [{ to: balanceCall.address, data: encodeFunctionData({ abi: balanceCall.abi as Abi, functionName: balanceCall.functionName, args: balanceCall.args }) }, 'latest'],
                        id: requestIdCounter++
                    }, key, type: "balance", requiredAmount, chainId
                });
                batchRequests.push({
                    request: {
                        jsonrpc: '2.0', method: 'eth_call',
                        params: [{ to: allowanceCall.address, data: encodeFunctionData({ abi: allowanceCall.abi as Abi, functionName: allowanceCall.functionName, args: allowanceCall.args }) }, 'latest'],
                        id: requestIdCounter++
                    }, key, type: "allowance", requiredAmount, chainId
                });
            }
        }
    });

    console.log(`Worker: Sending batch request with ${batchRequests.length} checks.`); // Add log

    if (batchRequests.length > 0) {
        try {
            // Group requests by chainId for potential separate batch calls if needed,
            // but standard JSON-RPC batching usually handles mixed requests in one array.
            // We'll send one large batch first.
            const batchPayload = batchRequests.map(br => br.request as JsonRpcRequest); // Ensure type is JsonRpcRequest

            // Use the rpcClient to send the batch request
            // Assuming chainId 100 is the target for all permits in this app currently
            const batchResponses = await rpcClient.request(100, batchPayload) as JsonRpcResponse[]; // Use rpcClient

            console.log(`Worker: Received ${batchResponses.length} responses in batch.`); // Add log

            // Process batch responses
            const responseMap = new Map<number, JsonRpcResponse>(batchResponses.map(res => [res.id as number, res]));

            batchRequests.forEach(batchReq => {
                // Find the original permit corresponding to this request
                const permit = permitsByKey.get(batchReq.key);
                if (!permit) {
                    console.error(`Worker: Could not find original permit for key ${batchReq.key} during batch response processing.`);
                    return; // Skip processing if original permit not found
                }

                const res = responseMap.get(batchReq.request.id as number);
                const updateData = checkedPermitsMap.get(batchReq.key) || {};

                if (!res) {
                    console.warn(`Worker: No response found for request ID ${batchReq.request.id} (Permit ${batchReq.key}, Type ${batchReq.type})`);
                    updateData.checkError = `Batch response missing (${batchReq.type})`;
                } else if (res.error) {
                    console.warn(`Worker: Prereq check failed via batch for permit ${batchReq.key} (${batchReq.type}):`, res.error.message);
                    updateData.checkError = `Check failed (${batchReq.type}). ${res.error.message}`;
                } else if (res.result !== undefined && res.result !== null) {
                    try {
                        if (batchReq.type === "balance" && batchReq.requiredAmount !== undefined) updateData.ownerBalanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
                        else if (batchReq.type === "allowance" && batchReq.requiredAmount !== undefined) updateData.permit2AllowanceSufficient = BigInt(res.result as string) >= batchReq.requiredAmount;
                        else if (batchReq.type === "nonce") {
                            // Only ERC20 nonce check is performed now
                            const bitmap = BigInt(res.result as string);
                            updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
                        }
                    } catch (parseError: unknown) {
                         console.error(`Worker: Error parsing batch result for permit ${batchReq.key} (${batchReq.type}):`, parseError);
                         updateData.checkError = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
                    }
                } else {
                     console.warn(`Worker: Empty result for request ID ${batchReq.request.id} (Permit ${batchReq.key}, Type ${batchReq.type})`);
                     updateData.checkError = `Empty result (${batchReq.type})`;
                }
                checkedPermitsMap.set(batchReq.key, updateData);
            });

        } catch (error: unknown) {
            console.error("Worker: Error during batch RPC request:", error);
            // Mark all permits in this batch as errored? Or handle more gracefully?
            initialPermits.forEach(permit => {
                 const key = `${permit.nonce}-${permit.networkId}`;
                 const updateData = checkedPermitsMap.get(key) || {};
                 updateData.checkError = `Batch request failed: ${error instanceof Error ? error.message : String(error)}`;
                 checkedPermitsMap.set(key, updateData);
            });
        }
    }

    console.log("Worker: Starting final filtering..."); // Add log
    // Map check results back to permits and filter based on nonce status
    const finalCheckedPermits = initialPermits.map((permit, index) => { // Add index for logging
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        // Combine original permit data with any check results found
        const updatedPermit = checkData ? { ...permit, ...checkData } : { ...permit };

        // Determine if the permit should be filtered out based on nonce status.
        // Filter if nonce is confirmed used OR if the nonce check itself failed (as RPC errors often mask a used nonce).
        const nonceCheckFailed = !!(updatedPermit.checkError && batchRequests.some(req => req.key === key && req.type === "nonce")); // Check if any nonce request for this key failed
        const shouldFilter = updatedPermit.isNonceUsed === true || nonceCheckFailed;

        if (index < 10) { // Log first few filtering decisions
            if (shouldFilter) {
                console.log(`Worker: Filtering out permit [${index}] ${key}. Reason: ${updatedPermit.isNonceUsed ? 'Nonce confirmed used' : `Nonce check failed (${updatedPermit.checkError})`}`);
            } else {
                console.log(`Worker: Keeping permit [${index}] ${key}. Nonce used: ${updatedPermit.isNonceUsed}, Nonce check error: ${nonceCheckFailed ? updatedPermit.checkError : 'None'}`);
            }
        }

        // Attach _filterOut property
        return { ...updatedPermit, _filterOut: shouldFilter };

    }).filter(permit => !permit._filterOut); // Simple filter based on the _filterOut flag

    console.log(`Worker: Finished filtering. ${finalCheckedPermits.length} permits remaining.`); // Add log

    // The result is technically (PermitData & { _filterOut: false | undefined })[]
    // but should be compatible with PermitData[] for practical purposes.
    return finalCheckedPermits as PermitData[]; // Return permits that passed the nonce filter
}


// --- Worker Message Handling ---
// Removed unused WorkerMessage type (and associated eslint error)

self.onmessage = async (event: MessageEvent<{ type: 'INIT' | 'FETCH_PERMITS'; payload: WorkerPayload }>) => { // Use inline type
    const { type, payload } = event.data;

    if (type === 'INIT') {
        // Initialize Supabase client with credentials passed from main thread
        const supabaseUrl = payload.supabaseUrl; // Use local consts
        const supabaseAnonKey = payload.supabaseAnonKey;
        // Remove unused assignments:
        // SUPABASE_URL = payload.supabaseUrl;
        // SUPABASE_ANON_KEY = payload.supabaseAnonKey;
        if (supabaseUrl && supabaseAnonKey) {
            try {
                // Use createClient directly if needed, or ensure supabase is initialized correctly
                // Assuming createClient is the intended function here, despite the eslint error for it being unused globally
                supabase = createClient(supabaseUrl, supabaseAnonKey); // Assign to the 'let' variable
                console.log("Worker: Supabase client initialized.");
                self.postMessage({ type: 'INIT_SUCCESS' });
            } catch (error: unknown) { // Use unknown for caught errors
                console.error("Worker: Error initializing Supabase client:", error);
                self.postMessage({ type: 'INIT_ERROR', error: error instanceof Error ? error.message : String(error) });
            }
        } else {
            self.postMessage({ type: 'INIT_ERROR', error: 'Supabase credentials not received by worker.' });
        }
    } else if (type === 'FETCH_PERMITS') {
        const address = payload.address as Address;
        console.log(`Worker: Received request to fetch permits for ${address}`);
        try {
            // Pass the full payload to fetchAndCheckPermitsForWorker
            const permits = await fetchAndCheckPermitsForWorker(address, payload);
            self.postMessage({ type: 'PERMITS_RESULT', permits });
        } catch (error: unknown) { // Use unknown for caught errors
            console.error("Worker: Error fetching/checking permits:", error);
            self.postMessage({ type: 'PERMITS_ERROR', error: error instanceof Error ? error.message : String(error) });
        }
    }
};

console.log("Permit checker worker started.");
