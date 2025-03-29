import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { Context, Hono, Next } from "https://deno.land/x/hono@v4.1.5/mod.ts";
import type { PermitData, TokenInfo, PartnerInfo } from "../../shared/types.ts";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parseAbiItem, encodeFunctionData, type Hex } from "viem"; // Keep viem imports for potential future use
import { gnosis, localhost, mainnet } from "npm:viem/chains";
import { Permit2RpcManager, readContract } from "@pavlovcik/permit2-rpc-manager";

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
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
// Removed MULTICALL3_ADDRESS

let jwtKey: CryptoKey | null = null;
let supabase: SupabaseClient | null = null;
let rpcManager: Permit2RpcManager | null = null;

// --- ABIs ---
const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");
const permit2TransferFromAbi = parseAbiItem(
  "function permitTransferFrom(((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline), (address to, uint256 requestedAmount) transferDetails, address owner, bytes signature)"
);
const nftRewardAbi = parseAbiItem("function nonceRedeemed(uint256 nonce) view returns (bool)");
// Removed multicall3Abi definition

// --- Initialization ---
async function initialize() {
  // Init JWT Key
  if (!JWT_SECRET_KEY) { console.error("FATAL: JWT_SECRET missing."); Deno.exit(1); }
  try {
    const encoder = new TextEncoder();
    jwtKey = await crypto.subtle.importKey("raw", encoder.encode(JWT_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    console.log("JWT key initialized.");
  } catch (err) { console.error("Failed to initialize JWT key:", err); Deno.exit(1); }

  // Init Supabase Client
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { console.error("FATAL: Supabase config missing."); Deno.exit(1); }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Supabase client initialized.");

  // Init RPC Manager
  try {
    rpcManager = new Permit2RpcManager();
    console.log("Permit2RpcManager initialized.");
  } catch (err) { console.error("Failed to initialize Permit2RpcManager:", err); Deno.exit(1); }
}

const app = new Hono();

// --- Middleware ---
// Manual CORS Middleware
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
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
  if (!jwtKey) { console.error("JWT Middleware Error: JWT key not initialized."); return c.json({ error: "Server initialization error" }, 500); }
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) { console.log("JWT Middleware: No token found."); return c.json({ error: "Missing authentication token" }, 401); }
  try {
    const payload = await verify(token, jwtKey);
    c.set("jwtPayload", payload);
    await next();
  } catch (_error) { console.error("JWT verification failed:", _error); return c.json({ error: "Invalid or expired token" }, 401); }
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
  if (!rpcManager) throw new Error("Permit2RpcManager not initialized.");
  try {
    const wordPos = BigInt(permitData.nonce) >> 8n;
    const owner = permitData.owner;
    if (!owner) return true;
    const bitmap = await readContract<bigint>({ manager: rpcManager, chainId: permitData.networkId, address: PERMIT2_ADDRESS, abi: [permit2Abi], functionName: "nonceBitmap", args: [owner as `0x${string}`, wordPos] });
    const bit = 1n << (BigInt(permitData.nonce) & 255n);
    return Boolean(bitmap & bit);
  } catch (error) { console.error(`Error checking ERC20 permit claim status (nonce: ${permitData.nonce}, chain: ${permitData.networkId}):`, error); return true; }
}

async function isErc721NonceClaimed(permitData: PermitData): Promise<boolean> {
  if (!rpcManager) throw new Error("Permit2RpcManager not initialized.");
  try {
    if (!permitData.token?.address) return true;
    const isRedeemed = await readContract<boolean>({ manager: rpcManager, chainId: permitData.networkId, address: permitData.token.address as `0x${string}`, abi: [nftRewardAbi], functionName: "nonceRedeemed", args: [BigInt(permitData.nonce)] });
    return Boolean(isRedeemed);
  } catch (error) { console.error(`Error checking ERC721 permit claim status (nonce: ${permitData.nonce}, chain: ${permitData.networkId}):`, error); return true; }
}

// --- Permit Fetching Route ---
// Reverted to original path without optional slash
app.get("/api/permits", async (c: Context) => {
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const walletAddress = c.req.query("walletAddress");
  if (!walletAddress) { return c.json({ error: "Missing walletAddress query parameter" }, 400); }
  const lowerCaseWalletAddress = walletAddress.toLowerCase();
  console.log(`>>> ENTERING /api/permits for wallet: ${lowerCaseWalletAddress}`);
  try {
    const { data: userData, error: userFetchError } = await supabase.from(USERS_TABLE).select("github_id").eq("wallet_address", lowerCaseWalletAddress).single();
    if (userFetchError || !userData) { if (!userData) { console.log(`No user found for wallet ${lowerCaseWalletAddress}`); return c.json({ permits: [] }); } throw new Error(`Supabase user fetch error: ${userFetchError?.message || "User not found"}`); }
    const userGitHubId = userData.github_id;
    const { data: potentialPermits, error: permitError } = await supabase.from(PERMITS_TABLE).select(`*, token: ${TOKENS_TABLE} (address, network), partner: ${PARTNERS_TABLE} (wallet: ${WALLETS_TABLE} (address)), location: locations (node_url)`).eq("beneficiary_id", userGitHubId).is("transaction", null);
    if (permitError) { throw new Error(`Supabase permit fetch error: ${permitError.message}`); }
    if (!potentialPermits || potentialPermits.length === 0) { return c.json({ permits: [] }); }
    const validationPromises = potentialPermits.map(async (permit) => {
      const tokenData = permit.token; const ownerWalletData = permit.partner?.wallet;
      const permitData: PermitData = { nonce: String(permit.nonce), networkId: Number(permit.networkId || tokenData?.network || 0), beneficiary: lowerCaseWalletAddress, deadline: String(permit.deadline), signature: String(permit.signature), type: permit.amount && BigInt(permit.amount) > 0n ? "erc20-permit" : "erc721-permit", owner: String(ownerWalletData?.address || ""), tokenAddress: tokenData?.address ? String(tokenData.address) : undefined, token: { address: String(tokenData?.address || ""), network: Number(tokenData?.network || 0) }, amount: permit.amount !== undefined && permit.amount !== null ? String(permit.amount) : undefined, token_id: permit.token_id !== undefined && permit.token_id !== null ? Number(permit.token_id) : undefined, githubCommentUrl: String(permit.location?.node_url || ""), partner: { wallet: { address: String(ownerWalletData?.address || "") } } };
      // Inline check for required fields
      if (!permitData.nonce || !permitData.deadline || !permitData.signature || !permitData.beneficiary || !permitData.owner || (!permitData.amount && !permitData.token_id) || !permitData.token?.address) { return null; }
      const deadlineInt = parseInt(permitData.deadline, 10); if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) { return null; }
      let isClaimedOnChain = false;
      try { if (permitData.type === "erc20-permit") { isClaimedOnChain = await isErc20NonceClaimed(permitData); } else if (permitData.type === "erc721-permit") { isClaimedOnChain = await isErc721NonceClaimed(permitData); } else { return null; } } catch { return null; }
      if (isClaimedOnChain) { return null; }
      return permitData;
    });
    const validPermits = (await Promise.all(validationPromises)).filter((p): p is PermitData => p !== null);
    console.log(`Found ${validPermits.length} valid unclaimed permits for wallet ${lowerCaseWalletAddress}`);
    return c.json({ permits: validPermits });
  } catch (err) { console.error("Error fetching permits:", err); return c.json({ error: "Internal server error fetching permits" }, 500); }
});

// Removed /api/permits/prepare-claim-all route

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
    // Reverted to using std/http serve
    serve(app.fetch);
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    Deno.exit(1);
  });
