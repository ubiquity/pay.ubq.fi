import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { Context, Hono, Next } from "https://deno.land/x/hono@v4.1.5/mod.ts";
import type { PermitData, TokenInfo, PartnerInfo } from "../../shared/types.ts";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parseAbiItem, encodeFunctionData, type Hex } from "viem"; // Added encodeFunctionData and Hex
import { gnosis, localhost, mainnet } from "npm:viem/chains";
import { RpcHandler, readContract } from "@pavlovcik/permit2-rpc-manager";

// --- Load Environment Variables ---
await load({ export: true });

// --- Configuration ---
const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID");
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET");
const JWT_SECRET_KEY = Deno.env.get("JWT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Use consistent table names
const USERS_TABLE = "permit_app_users";
const PERMITS_TABLE = "permits";
const WALLETS_TABLE = "wallets";
const TOKENS_TABLE = "tokens";
const PARTNERS_TABLE = "partners";

// Constants
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const; // Use const assertion
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const; // Standard Multicall3 address

let jwtKey: CryptoKey | null = null;
let supabase: SupabaseClient | null = null;
let rpcManager: RpcHandler | null = null;

// --- ABIs ---
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");
const permit2TransferFromAbi = parseAbiItem(
  "function permitTransferFrom(((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline), (address to, uint256 requestedAmount) transferDetails, address owner, bytes signature)"
); // ABI for encoding
const nftRewardAbi = parseAbiItem("function nonceRedeemed(uint256 nonce) view returns (bool)");
const multicall3Abi = parseAbiItem(
  "function aggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)"
); // ABI for Multicall3 aggregate

// --- Initialization ---
async function initialize() {
  // Init JWT Key
  if (!JWT_SECRET_KEY) {
    console.error("FATAL: JWT_SECRET missing.");
    Deno.exit(1);
  }
  try {
    const encoder = new TextEncoder();
    jwtKey = await crypto.subtle.importKey("raw", encoder.encode(JWT_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    console.log("JWT key initialized.");
  } catch (err) {
    console.error("Failed to initialize JWT key:", err);
    Deno.exit(1);
  }

  // Init Supabase Client
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("FATAL: Supabase config missing.");
    Deno.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Supabase client initialized.");

  // Init RPC Manager
  try {
    rpcManager = new RpcHandler();
    console.log("RpcHandler initialized.");
  } catch (err) {
    console.error("Failed to initialize RpcHandler:", err);
    Deno.exit(1);
  }
}

const app = new Hono();

// --- Middleware ---
// Manual CORS Middleware
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"]; // Add your frontend origin if different
  if (origin && allowedOrigins.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Allow-Credentials", "true");
  }
  if (c.req.method === "OPTIONS") {
    if (origin && allowedOrigins.includes(origin)) {
      c.header("Access-Control-Max-Age", "86400");
    }
    return c.body(null, 204);
  }
  await next();
});

// --- JWT Verification Middleware ---
const verifyJwtMiddleware = async (c: Context, next: Next) => {
  if (!jwtKey) {
    console.error("JWT Middleware Error: JWT key not initialized.");
    return c.json({ error: "Server initialization error" }, 500);
  }
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) {
    console.log("JWT Middleware: No token found.");
    return c.json({ error: "Missing authentication token" }, 401);
  }
  try {
    const payload = await verify(token, jwtKey);
    c.set("jwtPayload", payload);
    await next();
  } catch (_error) {
    console.error("JWT verification failed:", _error);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};

// --- Public Routes ---
app.get("/", (c: Context) => c.text("Permit Claiming API"));

// --- GitHub OAuth Callback Route (public) ---
app.post("/api/auth/github/callback", async (c: Context) => {
  /* ... Auth callback logic ... */
});

// --- Authenticated Routes ---

// --- On-Chain Validation Logic ---
async function isErc20NonceClaimed(permitData: PermitData): Promise<boolean> {
  if (!rpcManager) throw new Error("RpcHandler not initialized.");
  try {
    const wordPos = BigInt(permitData.nonce) >> 8n;
    const owner = permitData.owner;
    if (!owner) return true;
    const bitmap = await readContract<bigint>({
      handler: rpcManager,
      chainId: permitData.networkId,
      address: PERMIT2_ADDRESS,
      abi: [permit2Abi],
      functionName: "nonceBitmap",
      args: [owner as `0x${string}`, wordPos],
    });
    const bit = 1n << (BigInt(permitData.nonce) & 255n);
    return Boolean(bitmap & bit);
  } catch (error) {
    console.error(`Error checking ERC20 permit claim status (nonce: ${permitData.nonce}, chain: ${permitData.networkId}):`, error);
    return true;
  }
}

async function isErc721NonceClaimed(permitData: PermitData): Promise<boolean> {
  if (!rpcManager) throw new Error("RpcHandler not initialized.");
  try {
    if (!permitData.token?.address) return true;
    const isRedeemed = await readContract<boolean>({
      handler: rpcManager,
      chainId: permitData.networkId,
      address: permitData.token.address as `0x${string}`,
      abi: [nftRewardAbi],
      functionName: "nonceRedeemed",
      args: [BigInt(permitData.nonce)],
    });
    return Boolean(isRedeemed);
  } catch (error) {
    console.error(`Error checking ERC721 permit claim status (nonce: ${permitData.nonce}, chain: ${permitData.networkId}):`, error);
    return true;
  }
}

// --- Permit Fetching Route ---
app.get("/api/permits", async (c: Context) => {
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const walletAddress = c.req.query("walletAddress");
  if (!walletAddress) {
    return c.json({ error: "Missing walletAddress query parameter" }, 400);
  }
  const lowerCaseWalletAddress = walletAddress.toLowerCase();
  console.log(`>>> ENTERING /api/permits for wallet: ${lowerCaseWalletAddress}`);
  try {
    const { data: userData, error: userFetchError } = await supabase
      .from(USERS_TABLE)
      .select("github_id")
      .eq("wallet_address", lowerCaseWalletAddress)
      .single();
    if (userFetchError || !userData) {
      if (!userData) {
        console.log(`No user found for wallet ${lowerCaseWalletAddress}`);
        console.log(`<<< EXITING /api/permits for wallet: ${lowerCaseWalletAddress} (No user found)`);
        return c.json({ permits: [] });
      }
      throw new Error(`Supabase user fetch error: ${userFetchError?.message || "User not found"}`);
    }
    const userGitHubId = userData.github_id;
    console.log(`Found github_id ${userGitHubId} for wallet ${lowerCaseWalletAddress}`);
    const { data: potentialPermits, error: permitError } = await supabase
      .from(PERMITS_TABLE)
      .select(`*, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: locations (node_url)`)
      .eq("beneficiary_id", userGitHubId)
      .is("transaction", null);
    if (permitError) {
      throw new Error(`Supabase permit fetch error: ${permitError.message}`);
    }
    if (!potentialPermits || potentialPermits.length === 0) {
      console.log(`No potential permits found in DB for user ${userGitHubId} (wallet: ${lowerCaseWalletAddress})`);
      console.log(`<<< EXITING /api/permits for wallet: ${lowerCaseWalletAddress} (No DB results)`);
      return c.json({ permits: [] });
    }
    console.log(`Processing ${potentialPermits.length} potential permits, validating on-chain...`);
    const validationPromises = potentialPermits.map(async (permit) => {
      const tokenData = permit.token;
      const ownerWalletData = permit.partner?.wallet;
      const permitData: PermitData = {
        nonce: String(permit.nonce),
        networkId: Number(permit.networkId || tokenData?.network || 0),
        beneficiary: lowerCaseWalletAddress,
        deadline: String(permit.deadline),
        signature: String(permit.signature),
        type: permit.amount && BigInt(permit.amount) > 0n ? "erc20-permit" : "erc721-permit",
        owner: String(ownerWalletData?.address || ""),
        tokenAddress: tokenData?.address ? String(tokenData.address) : undefined,
        token: { address: String(tokenData?.address || ""), network: Number(tokenData?.network || 0) },
        amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
        token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
        githubCommentUrl: String(permit.location?.node_url || ""),
        partner: { wallet: { address: String(ownerWalletData?.address || "") } },
      };
      if (!permitData.networkId || !permitData.nonce || !permitData.deadline) {
        console.warn(`Permit nonce ${permit.nonce} is missing essential data. Skipping.`);
        return null;
      }
      const deadlineInt = parseInt(permitData.deadline, 10);
      if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
        return null;
      }
      let isClaimedOnChain = false;
      try {
        if (permitData.type === "erc20-permit") {
          if (!permitData.owner) {
            console.warn(`Permit nonce ${permit.nonce} identified as ERC20 but missing owner_address. Skipping.`);
            return null;
          }
          isClaimedOnChain = await isErc20NonceClaimed(permitData);
        } else if (permitData.type === "erc721-permit") {
          if (!permitData.tokenAddress) {
            console.warn(`Permit nonce ${permit.nonce} identified as ERC721 but missing token_address. Skipping.`);
            return null;
          }
          isClaimedOnChain = await isErc721NonceClaimed(permitData);
        } else {
          console.warn(`Cannot determine permit type for nonce ${permit.nonce}.`);
          return null;
        }
      } catch (validationError) {
        console.error(`On-chain validation failed for permit nonce ${permit.nonce}:`, validationError);
        return null;
      }
      if (isClaimedOnChain) {
        return null;
      }
      return permitData;
    });
    const validPermits = (await Promise.all(validationPromises)).filter((p) => p !== null);
    console.log(`Found ${validPermits.length} valid unclaimed permits for wallet ${lowerCaseWalletAddress}`);
    console.log(`<<< EXITING /api/permits for wallet: ${lowerCaseWalletAddress} (Success)`);
    return c.json({ permits: validPermits });
  } catch (err) {
    console.error("Error fetching permits:", err);
    console.log(`<<< EXITING /api/permits for wallet: ${lowerCaseWalletAddress} (Error)`);
    return c.json({ error: "Internal server error fetching permits" }, 500);
  }
});

// --- NEW: Prepare Batch Claim Route ---
app.post("/api/permits/prepare-claim-all", verifyJwtMiddleware, async (c: Context) => {
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const payload = c.get("jwtPayload");
  const githubUserId = payload?.sub;
  if (!githubUserId) return c.json({ error: "Invalid token payload" }, 401);

  try {
    const { chainId, walletAddress } = await c.req.json();
    if (!chainId || !walletAddress) {
      return c.json({ error: "Missing chainId or walletAddress in request body" }, 400);
    }
    const lowerCaseWalletAddress = walletAddress.toLowerCase();
    console.log(`>>> Preparing claim-all for user ${githubUserId}, wallet ${lowerCaseWalletAddress}, chain ${chainId}`);

    // 1. Fetch valid, unclaimed permits for the user on the specified chain
    // (Similar logic to GET /api/permits but filtered by chainId and beneficiary wallet)
    const { data: potentialPermits, error: permitError } = await supabase
      .from(PERMITS_TABLE)
      .select(`*, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address))`)
      .eq("beneficiary_id", githubUserId)
      .eq("networkId", chainId) // Filter by chain ID
      .is("transaction", null);

    if (permitError) throw new Error(`Supabase permit fetch error: ${permitError.message}`);
    if (!potentialPermits || potentialPermits.length === 0) return c.json({ error: "No permits found for this user on the specified chain" }, 404);

    // 2. Validate permits (deadline, on-chain status, prerequisites - reuse logic)
    const validationPromises = potentialPermits.map(async (permit) => {
      const tokenData = permit.token;
      const ownerWalletData = permit.partner?.wallet;
      const permitData: PermitData = {
        nonce: String(permit.nonce),
        networkId: Number(chainId),
        beneficiary: lowerCaseWalletAddress,
        deadline: String(permit.deadline),
        signature: String(permit.signature),
        type: permit.amount && BigInt(permit.amount) > 0n ? "erc20-permit" : "erc721-permit",
        owner: String(ownerWalletData?.address || ""),
        tokenAddress: tokenData?.address ? String(tokenData.address) : undefined,
        token: { address: String(tokenData?.address || ""), network: Number(chainId) },
        amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined,
        token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined,
        githubCommentUrl: "",
        partner: { wallet: { address: String(ownerWalletData?.address || "") } },
      };
      if (!hasRequiredFields(permitData)) return null; // Basic field check
      const deadlineInt = parseInt(permitData.deadline, 10);
      if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
        return null;
      }
      let isClaimedOnChain = false;
      try {
        if (permitData.type === "erc20-permit") {
          isClaimedOnChain = await isErc20NonceClaimed(permitData);
        } else if (permitData.type === "erc721-permit") {
          isClaimedOnChain = await isErc721NonceClaimed(permitData);
        } else {
          return null;
        }
      } catch {
        return null;
      }
      if (isClaimedOnChain) {
        return null;
      }
      // TODO: Add prerequisite checks (balance/allowance) here if needed, similar to frontend logic
      return permitData;
    });
    const claimablePermits = (await Promise.all(validationPromises)).filter((p): p is PermitData => p !== null);

    if (claimablePermits.length === 0) {
      return c.json({ error: "No valid, claimable permits found" }, 404);
    }

    // 3. Encode individual permitTransferFrom calls
    const encodedCalls = claimablePermits.map((permit) => {
      const permitArgs = {
        permitted: { token: permit.token!.address as `0x${string}`, amount: BigInt(permit.amount!) },
        nonce: BigInt(permit.nonce),
        deadline: BigInt(permit.deadline),
      };
      const transferDetailsArgs = { to: permit.beneficiary as `0x${string}`, requestedAmount: BigInt(permit.amount!) };
      return encodeFunctionData({
        abi: [permit2TransferFromAbi],
        functionName: "permitTransferFrom",
        args: [permitArgs, transferDetailsArgs, permit.owner as `0x${string}`, permit.signature as `0x${string}`],
      });
    });

    // 4. Prepare arguments for Multicall3 aggregate function
    const aggregateArgs = encodedCalls.map((callData) => ({
      target: PERMIT2_ADDRESS,
      callData: callData,
    }));

    // 5. Encode the aggregate call
    const multicallData = encodeFunctionData({
      abi: [multicall3Abi],
      functionName: "aggregate",
      args: [aggregateArgs],
    });

    console.log(`<<< Prepared claim-all data for ${claimablePermits.length} permits on chain ${chainId}`);
    // 6. Return transaction data
    return c.json({
      to: MULTICALL3_ADDRESS,
      data: multicallData,
      // value: '0', // Usually 0 for token transfers
      // Include nonces for frontend to update status optimistically?
      claimedNonces: claimablePermits.map((p) => p.nonce),
    });
  } catch (err) {
    console.error("Error preparing claim-all transaction:", err);
    return c.json({ error: "Internal server error preparing batch claim" }, 500);
  }
});

// Link wallet address to user
app.post("/api/wallet/link", verifyJwtMiddleware, async (c: Context) => {
  /* ... Link wallet logic ... */
});

// Test a single permit
app.post("/api/permits/test", verifyJwtMiddleware, async (c: Context) => {
  /* ... Test permit logic ... */
});

// Update permit status (placeholder)
app.post("/api/permits/update-status", verifyJwtMiddleware, async (c: Context) => {
  /* ... Update status logic ... */
});

// --- Server Start ---
initialize()
  .then(() => {
    console.log("API server starting on http://localhost:8000");
    serve(app.fetch);
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    Deno.exit(1);
  });
