import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
// import { logger } from "https://deno.land/x/hono@v4.1.5/middleware/logger.ts"; // Still commented out
import { Context, Hono, Next } from "https://deno.land/x/hono@v4.1.5/mod.ts";
// Import shared types
import type { PermitData, TokenInfo, PartnerInfo } from "../../shared/types.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { createPublicClient, http, parseAbiItem, PublicClient } from 'npm:viem';
import { gnosis, localhost, mainnet } from 'npm:viem/chains';

// --- Load Environment Variables ---
await load({ export: true });

// --- Configuration ---
const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID");
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET");
const JWT_SECRET_KEY = Deno.env.get("JWT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Use consistent table names
const USERS_TABLE = 'permit_app_users';
const PERMITS_TABLE = 'permits';
const WALLETS_TABLE = 'wallets';
const TOKENS_TABLE = 'tokens';
const PARTNERS_TABLE = 'partners'; // Added for owner lookup

// Constants
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

let jwtKey: CryptoKey | null = null;
let supabase: SupabaseClient | null = null;
const rpcClients: Map<number, PublicClient> = new Map();

// --- ABIs ---
const permit2Abi = parseAbiItem('function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)');
const nftRewardAbi = parseAbiItem('function nonceRedeemed(uint256 nonce) view returns (bool)'); // Assuming this ABI is correct for ERC721 permits

// --- Initialization ---
async function initialize() {
  // Init JWT Key
  if (!JWT_SECRET_KEY) { console.error("FATAL: JWT_SECRET missing."); Deno.exit(1); }
  try {
    const encoder = new TextEncoder();
    jwtKey = await crypto.subtle.importKey( "raw", encoder.encode(JWT_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"] );
    console.log("JWT key initialized.");
  } catch (err) { console.error("Failed to initialize JWT key:", err); Deno.exit(1); }

  // Init Supabase Client
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { console.error("FATAL: Supabase config missing."); Deno.exit(1); }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Supabase client initialized.");
}

// --- RPC Client Helper ---
function getRpcClient(networkId: number): PublicClient {
  if (rpcClients.has(networkId)) { return rpcClients.get(networkId)!; }
  const rpcUrls: Record<number, string> = {
      1: Deno.env.get("RPC_URL_1") || "https://ethereum.publicnode.com",
      100: Deno.env.get("RPC_URL_100") || "https://rpc.gnosischain.com",
      31337: Deno.env.get("RPC_URL_31337") || "http://127.0.0.1:8545",
  };
  const rpcUrl = rpcUrls[networkId];
  if (!rpcUrl) { throw new Error(`RPC URL not configured for network ID: ${networkId}`); }
  let chain;
  switch (networkId) {
    case 1: chain = mainnet; break;
    case 100: chain = gnosis; break;
    case 31337: chain = localhost; break;
    default: throw new Error(`Chain configuration missing for network ID: ${networkId}`);
  }
  const client = createPublicClient({ chain: chain, transport: http(rpcUrl) });
  rpcClients.set(networkId, client);
  return client;
}

const app = new Hono();

// --- Middleware ---
// Manual CORS Middleware
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  if (c.req.method === 'OPTIONS') {
    if (origin && allowedOrigins.includes(origin)) { c.header('Access-Control-Max-Age', '86400'); }
    return c.body(null, 204);
  }
  await next();
});

// app.use("*", logger()); // Still commented out

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
    console.log("JWT Middleware: Verifying token...");
    const payload = await verify(token, jwtKey);
    console.log("JWT Middleware: Verification successful, payload:", payload);
    c.set('jwtPayload', payload);
    const response = await next(); // Call next and store potential response
    console.log("JWT Middleware: next() completed for path:", c.req.path);
    return response; // Explicitly return the response from the downstream handler
  } catch (_error) {
    console.error("JWT verification failed:", _error);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};

// --- Public Routes ---
app.get("/", (c: Context) => c.text("Permit Claiming API"));

// --- GitHub OAuth Callback Route (public) ---
app.post("/api/auth/github/callback", async (c: Context) => { /* ... Auth callback logic ... */ });

// --- Authenticated Routes ---

// --- On-Chain Validation Logic ---
async function isErc20NonceClaimed(permitData: PermitData): Promise<boolean> {
  try {
    const client = getRpcClient(permitData.networkId);
    const wordPos = BigInt(permitData.nonce) >> 8n;
    const owner = permitData.owner;
    if (!owner) return true; // Fail safe - treat as claimed if no owner
    const bitmap = await client.readContract({
      address: PERMIT2_ADDRESS,
      abi: [permit2Abi],
      functionName: 'nonceBitmap',
      args: [owner, wordPos]
    });
    const bit = 1n << (BigInt(permitData.nonce) & 255n);
    return Boolean(bitmap & bit);
  } catch (error) {
    console.error('Error checking ERC20 permit claim status:', error);
    return true; // Fail safe - treat as claimed if check fails
  }
}

async function isErc721NonceClaimed(permitData: PermitData): Promise<boolean> {
  try {
    const client = getRpcClient(permitData.networkId);
    if (!permitData.token?.address) return true; // Fail safe - treat as claimed if no token
    const isRedeemed = await client.readContract({
      address: permitData.token.address,
      abi: [nftRewardAbi],
      functionName: 'nonceRedeemed',
      args: [BigInt(permitData.nonce)]
    });
    return Boolean(isRedeemed);
  } catch (error) {
    console.error('Error checking ERC721 permit claim status:', error);
    return true; // Fail safe - treat as claimed if check fails
  }
}

// --- Permit Fetching Route ---
app.get("/api/permits", verifyJwtMiddleware, async (c: Context) => {
  const payload = c.get('jwtPayload');
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const githubUserId = payload?.sub;
  if (!githubUserId) return c.json({ error: "Invalid token payload" }, 401);

  console.log(`>>> ENTERING /api/permits for user: ${payload?.gh_login}`); // Entry log
  try {
    const userGitHubIdInt = parseInt(githubUserId, 10);

    // Step 1: Fetch permits with related token, partner, and location data
    console.log(`Querying permits for beneficiary_id: ${userGitHubIdInt}`);
    const { data: potentialPermits, error: permitError } = await supabase
        .from(PERMITS_TABLE)
        .select(`
            *,
            token: ${TOKENS_TABLE} (address, network),
            partner: ${PARTNERS_TABLE} (
                wallet: ${WALLETS_TABLE} (address)
            ),
            location: locations (node_url)
        `)
        .eq('beneficiary_id', userGitHubIdInt)
        .is('transaction', null);

    if (permitError) {
        console.error("Supabase permit fetch error:", permitError);
        throw new Error(`Supabase permit fetch error: ${permitError.message}`);
    }

    console.log("Raw potential permits from DB:", potentialPermits);

    if (!potentialPermits || potentialPermits.length === 0) {
        console.log(`No potential permits found in DB for user ${payload?.gh_login}`);
        console.log(`<<< EXITING /api/permits for user: ${payload?.gh_login} (No DB results)`);
        return c.json({ permits: [] });
    }

    // Step 2: Fetch beneficiary wallet addresses separately
    const beneficiaryIds = potentialPermits.map(p => String(p.beneficiary_id));
    const { data: users, error: usersError } = await supabase
      .from(USERS_TABLE)
      .select('github_id, wallet_address')
      .in('github_id', beneficiaryIds);

    if (usersError) {
      console.error("Supabase user fetch error:", usersError);
      throw new Error(`Supabase user fetch error: ${usersError.message}`);
    }

    const beneficiaryWalletMap = new Map(users.map(u => [String(u.github_id), u.wallet_address]));
    console.log("Beneficiary Wallet Map:", beneficiaryWalletMap);

    // Step 3: Construct final permit data and perform On-Chain Validation
    console.log(`Processing ${potentialPermits.length} potential permits, validating on-chain...`);
    const validationPromises = potentialPermits.map(async (permit) => {
        const tokenData = permit.token;
        const ownerWalletData = permit.partner?.wallet;
        const beneficiaryWalletAddress = beneficiaryWalletMap.get(String(permit.beneficiary_id)); // Get address from map

        console.log(`Raw permit object for nonce ${permit.nonce}:`, permit);

        // Skip if beneficiary address couldn't be found
        if (!beneficiaryWalletAddress) {
          console.warn(`Permit nonce ${permit.nonce}: Could not find beneficiary wallet address for beneficiary_id ${permit.beneficiary_id}. Skipping.`);
          return null;
        }

        const permitData: PermitData = {
          nonce: permit.nonce,
          networkId: permit.networkId || tokenData?.network || 0,
          beneficiary: beneficiaryWalletAddress, // Use address fetched separately
          deadline: permit.deadline,
          signature: permit.signature,
          type: permit.amount && BigInt(permit.amount) > 0n ? 'erc20-permit' : 'erc721-permit',
          owner: ownerWalletData?.address || '',
          tokenAddress: tokenData?.address,
          token: {
            address: tokenData?.address || '',
            network: tokenData?.network || 0
          },
          amount: permit.amount,
          token_id: permit.token_id,
          githubCommentUrl: permit.location?.node_url || '',
          partner: {
            wallet: {
              address: ownerWalletData?.address || ''
            }
          }
        };

        if (!permitData.networkId || !permitData.nonce || !permitData.deadline) {
          console.warn(`Permit nonce ${permit.nonce} is missing essential data (networkId, nonce, deadline). Skipping.`);
          return null;
        }

        const deadlineInt = parseInt(permitData.deadline, 10);
        if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
          console.log(`Permit nonce ${permit.nonce} is expired or has invalid deadline.`);
          return null;
        }

        let isClaimedOnChain = false;
        try {
          if (permitData.type === 'erc20-permit') {
            console.log(`Validating as ERC20 (nonce: ${permitData.nonce}, amount: ${permitData.amount})`);
            if (!permitData.owner) {
              console.warn(`Permit nonce ${permit.nonce} identified as ERC20 but missing owner_address. Skipping.`);
              return null;
            }
            isClaimedOnChain = await isErc20NonceClaimed(permitData);
          } else if (permitData.type === 'erc721-permit') {
            console.log(`Validating as ERC721 (nonce: ${permitData.nonce}, token_id: ${permitData.token_id})`);
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
            return null; // Skip permits where validation fails
        }


        if (isClaimedOnChain) {
          console.log(`Permit nonce ${permit.nonce} already claimed on-chain.`);
          return null;
        }

        return permitData;
    });
    const validPermits = (await Promise.all(validationPromises)).filter(p => p !== null);
    console.log(`Found ${validPermits.length} valid unclaimed permits for user ${payload?.gh_login}`);
    console.log(`<<< EXITING /api/permits for user: ${payload?.gh_login} (Success)`);
    return c.json({ permits: validPermits });
  } catch(err) { console.error("Error fetching permits:", err); console.log(`<<< EXITING /api/permits for user: ${payload?.gh_login} (Error)`); return c.json({ error: "Internal server error fetching permits" }, 500); }
});

// Link wallet address to user
app.post("/api/wallet/link", verifyJwtMiddleware, async (c: Context) => {
  const payload = c.get('jwtPayload');
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const githubUserId = payload?.sub;
  if (!githubUserId) return c.json({ error: "Invalid token payload" }, 401);

  try {
    const body = await c.req.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return c.json({ error: "Wallet address is required" }, 400);
    }

    // Update wallet address for the authenticated user in permit_app_users table
    const { error: updateError } = await supabase
      .from(USERS_TABLE)
      .update({ wallet_address: walletAddress.toLowerCase() })
      .eq('github_id', githubUserId);

    if (updateError) {
      console.error("Error linking wallet:", updateError);
      return c.json({ error: "Failed to link wallet" }, 500);
    }

    return c.json({ message: "Wallet linked successfully" });
  } catch (err) {
    console.error("Error processing wallet link:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Test a single permit
app.post("/api/permits/test", verifyJwtMiddleware, async (c: Context) => {
  const payload = c.get('jwtPayload');
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);

  try {
    const body = await c.req.json();
    const { nonce, networkId, walletAddress, tokenAddress, beneficiary, deadline: requestDeadline, amount, token_id } = body;

    const missingParams: string[] = [];
    const checkParam = (value: any, name: string) => {
      if (value === undefined || value === null || value === '') {
        missingParams.push(name);
      }
    };

    checkParam(nonce, 'nonce');
    checkParam(networkId, 'networkId');
    checkParam(walletAddress, 'walletAddress');
    checkParam(tokenAddress, 'tokenAddress');
    checkParam(beneficiary, 'beneficiary');
    checkParam(requestDeadline, 'deadline');

    // Require either amount (for ERC20) or token_id (for ERC721)
    if (amount === undefined && token_id === undefined) {
      missingParams.push('amount or token_id');
    }

    if (missingParams.length > 0) {
      return c.json({
        error: `Missing required parameters: ${missingParams.join(', ')}`,
        missingParams
      }, 400);
    }

    // Fetch only the owner address needed for validation
    const { data: ownerData, error: ownerError } = await supabase
      .from(PERMITS_TABLE)
      .select(`
        partner: ${PARTNERS_TABLE}!inner(
          wallet: ${WALLETS_TABLE}!inner(address)
        )
      `)
      .eq('nonce', nonce)
      // .eq('networkId', networkId) // networkId is not in permits table
      .eq('token_id', token_id ?? null) // Use token_id or amount to help identify permit
      .eq('amount', amount ?? null)
      .single();

    if (ownerError || !ownerData?.partner?.wallet?.address) {
      console.error("Error fetching owner address for test:", ownerError);
      return c.json({
        error: ownerError ? `Database error: ${ownerError.message}` : "Could not find owner for permit",
        isValid: false
      }, 500);
    }
    const ownerAddress = ownerData.partner.wallet.address;


    // Check deadline from request body
    const deadlineInt = parseInt(requestDeadline, 10);
    if (isNaN(deadlineInt) || deadlineInt < Math.floor(Date.now() / 1000)) {
      return c.json({
        isValid: false,
        error: "Permit has expired"
      });
    }

    // Check if requesting wallet matches beneficiary from request body
    if (walletAddress.toLowerCase() !== beneficiary.toLowerCase()) {
      return c.json({
        isValid: false,
        error: "Wallet address does not match permit beneficiary"
      });
    }

    // Check claim status on-chain using data from request body + fetched owner address
    const permitTestData: PermitData = {
        nonce,
        networkId,
        beneficiary,
        deadline: requestDeadline,
        signature: body.signature, // Assuming signature is passed in body
        type: amount ? 'erc20-permit' : 'erc721-permit',
        owner: ownerAddress, // Use fetched owner address
        tokenAddress,
        token: { address: tokenAddress, network: networkId },
        amount,
        token_id,
        githubCommentUrl: body.githubCommentUrl || '', // Assuming passed in body
        partner: { wallet: { address: ownerAddress || '' } } // Use fetched ownerAddress
    };


    let isClaimedOnChain = false;
    if (permitTestData.type === 'erc20-permit') {
      if (!permitTestData.owner) {
        return c.json({ isValid: false, error: "Missing owner address for ERC20 permit" });
      }
      isClaimedOnChain = await isErc20NonceClaimed(permitTestData);
    } else if (permitTestData.type === 'erc721-permit') {
      if (!permitTestData.tokenAddress) {
        return c.json({ isValid: false, error: "Missing token address for ERC721 permit" });
      }
      isClaimedOnChain = await isErc721NonceClaimed(permitTestData);
    } else {
      return c.json({ isValid: false, error: "Invalid permit type" });
    }

    if (isClaimedOnChain) {
      return c.json({ isValid: false, error: "Permit has already been claimed" });
    }

    // All checks passed
    return c.json({ isValid: true });

  } catch (err) {
    console.error("Error testing permit:", err);
    return c.json({ error: "Internal server error testing permit", isValid: false }, 500);
  }
});

// Update permit status (placeholder)
app.post("/api/permits/update-status", verifyJwtMiddleware, async (c: Context) => { /* ... Update status logic ... */ });

// --- Server Start ---
initialize().then(() => {
  console.log("API server starting on http://localhost:8000");
  serve(app.fetch);
}).catch(err => {
  console.error("Failed to start server:", err);
  Deno.exit(1);
});
