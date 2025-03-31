import { type Address, type Abi, parseAbiItem } from "viem";
import type { PermitData } from "../types";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
// Removed unused import: import { createRpcClient, type JsonRpcResponse } from '@ubiquity-dao/permit2-rpc-client';
import type { JsonRpcResponse } from '@ubiquity-dao/permit2-rpc-client'; // Keep only JsonRpcResponse if needed elsewhere, or define locally
import { encodeFunctionData } from "viem";
import { preparePermitPrerequisiteContracts } from "../utils/permit-utils";

// --- Worker Setup ---

// Get Supabase config - In workers, import.meta.env is not directly available.
// These need to be passed from the main thread or configured differently.
// For now, assume they are somehow available (e.g., hardcoded, passed via message)
// A better approach is to pass them in the initial message from the main thread.
let SUPABASE_URL: string | undefined;
let SUPABASE_ANON_KEY: string | undefined;

// Define table names
const USERS_TABLE = "permit_app_users";
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";
const LOCATIONS_TABLE = "locations";

// ABIs needed for checks
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");
const nftRewardAbi = parseAbiItem("function nonceRedeemed(uint256 nonce) view returns (bool)");

// Initialize Supabase client within the worker scope
let supabase: SupabaseClient | null = null;
const PROXY_BASE_URL = "https://rpc.ubq.fi";
// Removed unused: const rpcClient = createRpcClient({ baseUrl: PROXY_BASE_URL });

// Define a type for the permit object potentially augmented with _filterOut
type MappedPermit = PermitData & { _filterOut?: boolean };

// Define type for JSON-RPC Request object
interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
    id: number | string; // Allow string or number ID
}


async function fetchAndCheckPermitsForWorker(address: Address) {
    if (!supabase) {
        throw new Error("Supabase client not initialized in worker.");
    }
    if (!address) {
        throw new Error("Address not provided to worker.");
    }

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

    // 2. Find potential permits for that github_id
    const { data: potentialPermitsData, error: permitError } = await supabase.from(PERMITS_TABLE).select(`*, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: ${LOCATIONS_TABLE} (node_url)`).eq("beneficiary_id", userGitHubId).is("transaction", null);

    if (permitError) {
        throw new Error(`Supabase permit fetch error: ${permitError.message}`);
    }
    if (!potentialPermitsData || potentialPermitsData.length === 0) {
        console.log(`Worker: No potential permits found for github_id ${userGitHubId}`);
        return []; // Return empty array if no permits
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
        token_id?: number | null;
        token?: DbToken;
        partner?: DbPartner;
        location?: DbLocation;
    }

    const mappedPermits = potentialPermitsData.map((permit: DbPermit): PermitData | null => {
        const tokenData = permit.token || {};
        const ownerWalletData = permit.partner?.wallet || {};
        const ownerAddressStr = ownerWalletData.address ? String(ownerWalletData.address) : "";
        const tokenAddressStr = tokenData.address ? String(tokenData.address) : undefined;
        const networkIdNum = Number(permit.networkId || tokenData.network || 0);
        const githubUrlStr = permit.location?.node_url ? String(permit.location.node_url) : "";

        const permitData: PermitData = {
            nonce: String(permit.nonce), networkId: networkIdNum, beneficiary: lowerCaseWalletAddress,
            deadline: String(permit.deadline), signature: String(permit.signature),
            type: permit.amount && BigInt(permit.amount) > 0n ? "erc20-permit" : "erc721-permit",
            owner: ownerAddressStr, tokenAddress: tokenAddressStr,
            token: tokenAddressStr ? { address: tokenAddressStr, network: networkIdNum } : undefined,
            amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
            token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
            githubCommentUrl: githubUrlStr, partner: ownerAddressStr ? { wallet: { address: ownerAddressStr } } : undefined,
            claimStatus: "Idle"
        };
        if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || (!permitData.amount && !permitData.token_id) || !permitData.token?.address) return null;
        const deadlineInt = parseInt(permitData.deadline, 10);
        if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) return null;
        return permitData;
    }).filter((p): p is PermitData => p !== null);

    initialPermits = mappedPermits;
    if (initialPermits.length === 0) return []; // Return early if no valid permits after mapping

    // 4. Perform frontend on-chain checks using JSON-RPC Batching
    const checkedPermitsMap = new Map<string, Partial<PermitData & { isNonceUsed?: boolean }>>();
    // Use the specific JsonRpcRequest type
    const batchRequests: { request: JsonRpcRequest; key: string; type: string; requiredAmount?: bigint; chainId: number }[] = [];
    let requestIdCounter = 1; // Counter for unique JSON-RPC request IDs

    // Create a map for quick lookup of permits by key
    const permitsByKey = new Map<string, PermitData>(initialPermits.map(p => [`${p.nonce}-${p.networkId}`, p]));

    initialPermits.forEach((permit) => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const chainId = permit.networkId;
        const owner = permit.owner as Address;

        // Nonce Checks
        if (permit.type === "erc20-permit") {
            const wordPos = BigInt(permit.nonce) >> 8n;
            batchRequests.push({
                request: {
                    jsonrpc: '2.0', method: 'eth_call',
                    params: [{ to: "0x000000000022D473030F116dDEE9F6B43aC78BA3", data: encodeFunctionData({ abi: [permit2Abi], functionName: "nonceBitmap", args: [owner, wordPos] }) }, 'latest'],
                    id: requestIdCounter++
                }, key, type: "nonce", chainId
            });
        } else if (permit.type === "erc721-permit" && permit.token?.address) {
            batchRequests.push({
                request: {
                    jsonrpc: '2.0', method: 'eth_call',
                    params: [{ to: permit.token.address as Address, data: encodeFunctionData({ abi: [nftRewardAbi], functionName: "nonceRedeemed", args: [BigInt(permit.nonce)] }) }, 'latest'],
                    id: requestIdCounter++
                }, key, type: "nonce", chainId
            });
        }

        // Balance & Allowance Checks (ERC20 only)
        if (permit.type === "erc20-permit" && permit.token?.address && permit.amount && permit.owner) {
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

    if (batchRequests.length > 0) {
        try {
            // Group requests by chainId for potential separate batch calls if needed,
            // but standard JSON-RPC batching usually handles mixed requests in one array.
            // We'll send one large batch first.
            const batchPayload = batchRequests.map(br => br.request);

            // Use standard fetch to send the batch request
            // Note: The rpcClient might have a way to do this, but fetch is standard.
            // We assume the PROXY_BASE_URL points to the correct endpoint that handles chain routing or is specific to chain 100.
            // If it needs chainId in the URL, this needs adjustment. Assuming /100 is handled by the proxy.
            const response = await fetch(`${PROXY_BASE_URL}/100`, { // Assuming chain 100 is the target or proxy handles it
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchPayload),
            });

            if (!response.ok) {
                throw new Error(`Batch RPC request failed with status ${response.status}: ${await response.text()}`);
            }

            const batchResponses = await response.json() as JsonRpcResponse[];

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
                            if (permit.type === "erc20-permit") {
                                const bitmap = BigInt(res.result as string);
                                updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
                            } else { // erc721-permit
                                updateData.isNonceUsed = res.result as boolean; // Assuming direct boolean result
                            }
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


    // Filter out used nonces and map final data (remains the same)
    const finalCheckedPermits = initialPermits.map((permit) => {
        const key = `${permit.nonce}-${permit.networkId}`;
        const checkData = checkedPermitsMap.get(key);
        // Filter if nonce check specifically failed or nonce is used
        if (checkData?.checkError?.toLowerCase().includes("nonce") || checkData?.isNonceUsed === true) {
            // console.log(`Worker: Filtering out permit ${key} due to nonce check failure or nonce being used.`);
            return { ...permit, ...checkData, _filterOut: true };
        }
        // Also filter if any other check failed for this permit
        if (checkData?.checkError && !checkData.checkError.toLowerCase().includes("nonce")) {
             console.log(`Worker: Filtering out permit ${key} due to other check failure: ${checkData.checkError}`);
             return { ...permit, ...checkData, _filterOut: true };
        }
        return checkData ? { ...permit, ...checkData } : permit;
    }).filter((permit: MappedPermit): permit is PermitData => !permit._filterOut);


    return finalCheckedPermits;
}


// --- Worker Message Handling ---
// Define expected message structure more specifically if possible
interface WorkerPayload {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    address?: Address;
    [key: string]: unknown; // Use unknown instead of any
}
interface WorkerMessage {
    type: 'INIT' | 'FETCH_PERMITS';
    payload: WorkerPayload;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;

    if (type === 'INIT') {
        // Initialize Supabase client with credentials passed from main thread
        SUPABASE_URL = payload.supabaseUrl;
        SUPABASE_ANON_KEY = payload.supabaseAnonKey;
        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            try {
                supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
            const permits = await fetchAndCheckPermitsForWorker(address);
            self.postMessage({ type: 'PERMITS_RESULT', permits });
        } catch (error: unknown) { // Use unknown for caught errors
            console.error("Worker: Error fetching/checking permits:", error);
            self.postMessage({ type: 'PERMITS_ERROR', error: error instanceof Error ? error.message : String(error) });
        }
    }
};

console.log("Permit checker worker started.");
