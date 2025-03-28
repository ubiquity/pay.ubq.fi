import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
// import { logger } from "https://deno.land/x/hono@v4.1.5/middleware/logger.ts"; // Still commented out
import { Context, Hono, Next } from "https://deno.land/x/hono@v4.1.5/mod.ts";
import { Octokit } from "https://esm.sh/@octokit/rest@20.0.2";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

// --- Load Environment Variables ---
await load({ export: true });

// --- Configuration ---
const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID");
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET");
const JWT_SECRET_KEY = Deno.env.get("JWT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "http://localhost:5173";
const TARGET_REPOS = (Deno.env.get("TARGET_REPOS") || "ubiquity/pay.ubq.fi").split(',');

// Use consistent table names
const USERS_TABLE = 'permit_app_users';
const PERMITS_TABLE = 'discovered_permits';

let jwtKey: CryptoKey | null = null;
let supabase: SupabaseClient | null = null;

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
  // ... (JWT verification logic remains the same) ...
  if (!jwtKey) { return c.json({ error: "Server initialization error" }, 500); }
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) { return c.json({ error: "Missing authentication token" }, 401); }
  try {
    const payload = await verify(token, jwtKey);
    c.set('jwtPayload', payload);
    await next();
  } catch (_error) { console.error("JWT verification failed:", _error); return c.json({ error: "Invalid or expired token" }, 401); }
};

// --- Public Routes ---
app.get("/", (c: Context) => c.text("Permit Claiming API"));

// --- GitHub OAuth Callback Route (public) ---
app.post("/api/auth/github/callback", async (c: Context) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !supabase || !jwtKey) {
    console.error("Backend configuration error (GitHub/Supabase/JWT).");
    return c.json({ error: "Server configuration error" }, 500);
  }

  let githubUser: { id?: string | number; login?: string; avatar_url?: string } | null = null;
  let accessToken: string | null = null;

  try {
    const { code } = await c.req.json();
    if (!code || typeof code !== 'string') { return c.json({ error: "Authorization code missing" }, 400); }

    // 1. Exchange code for access token
    console.log(`Exchanging code [${code}] for access token...`);
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code: code }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("GitHub token exchange failed:", tokenResponse.status, tokenData);
      throw new Error(`GitHub token exchange failed: ${tokenData.error || 'Unknown error'}`);
    }
    accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error("Access token not found in GitHub token response JSON:", tokenData);
      throw new Error(`Access token not found in GitHub response. Error: ${tokenData.error || 'Unknown error'}`);
    }
    console.log("Access token obtained successfully.");

    // 2. Fetch GitHub user profile (non-fatal)
    try {
        console.log("Fetching GitHub user profile...");
        const userResponse = await fetch("https://api.github.com/user", {
          headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" },
        });
        if (!userResponse.ok) {
          // Log error but don't throw, allow proceeding
          console.warn("GitHub user profile fetch failed:", userResponse.status, await userResponse.text());
          // Use a placeholder structure if fetch fails, try to get ID from token if possible (though not standard)
          // For now, we MUST have an ID later, so this path might still lead to failure if ID is truly unavailable.
          githubUser = { id: undefined, login: undefined, avatar_url: undefined };
        } else {
          githubUser = await userResponse.json();
          // Check essential fields after successful fetch
          if (!githubUser || !githubUser.id) {
              console.warn("Incomplete user data received from GitHub:", githubUser);
              // If ID is missing even on success, treat as failure for JWT/DB linking
              throw new Error("Incomplete user ID received from GitHub.");
          }
          console.log("GitHub User:", githubUser.login, githubUser.id);
        }
    } catch (profileError) {
        console.error("Error during GitHub user profile fetch:", profileError);
        // Allow proceeding, but log that profile data might be missing/stale
        githubUser = { id: undefined, login: undefined, avatar_url: undefined }; // Ensure githubUser is defined
    }

    // Ensure we have the ID before proceeding - this is critical
    if (!githubUser?.id) {
        // If profile fetch failed AND we couldn't get ID otherwise, we must fail here.
        throw new Error("Could not obtain GitHub user ID after token exchange.");
    }
    const githubIdStr = githubUser.id.toString();
    // Use login if available, otherwise null (since column is now nullable)
    const githubLogin = githubUser.login || null;
    const githubAvatarUrl = githubUser.avatar_url || null;


    // 3. Store/Update user in DB & Store Encrypted GitHub Token
    console.log(`Upserting user ${githubLogin || githubIdStr} (ID: ${githubIdStr}) into DB...`);
    const encryptToken = (token: string) => `encrypted(${token})`; // Placeholder
    const { data: dbUser, error: dbError } = await supabase
      .from(USERS_TABLE)
      .upsert({
         github_id: githubIdStr,
         username: githubLogin, // Now nullable
         avatar_url: githubAvatarUrl, // Now nullable
         encrypted_github_token: encryptToken(accessToken)
       }, { onConflict: 'github_id' })
      .select('github_id')
      .single();

    if (dbError) {
        console.error("Supabase user upsert failed:", dbError);
        throw new Error(`Supabase user upsert error: ${dbError.message}`);
    }
    console.log("Supabase user upsert successful (or existing user updated).");


    // 4. Generate Session Token (JWT)
    console.log("Generating JWT...");
    const payload = {
      sub: githubIdStr, // Use github_id as subject
      gh_id: githubUser.id,
      gh_login: githubLogin, // Use potentially null login
      exp: getNumericDate(60 * 60 * 24 * 7),
      iat: getNumericDate(0),
    };
    const jwt = await create({ alg: "HS256", typ: "JWT" }, payload, jwtKey);
    console.log("JWT generated successfully.");

    // 5. Return JWT to frontend
    return c.json({ token: jwt });

  } catch (error) {
    console.error("Error in GitHub callback handler:", error.message || error);
    if (error instanceof Error && error.stack) console.error("Stack trace:", error.stack);
    return c.json({ error: "Internal server error during GitHub callback" }, 500);
  }
});

// --- Authenticated Routes ---
// ... (rest of the authenticated routes remain the same) ...
app.use('/api/scan/*', verifyJwtMiddleware);
app.use('/api/permits/*', verifyJwtMiddleware);

app.get("/api/permits", async (c: Context) => {
  const payload = c.get('jwtPayload');
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const githubUserId = payload?.sub;

  if (!githubUserId) return c.json({ error: "Invalid token payload" }, 401);

  console.log("Fetching permits for user:", payload?.gh_login);
  try {
    const { data: permits, error } = await supabase
        .from(PERMITS_TABLE)
        .select('*')
        .eq('assigned_github_id', githubUserId);

    if (error) { throw new Error(`Supabase permit fetch error: ${error.message}`); }
    return c.json({ permits: permits || [] });
  } catch(err) {
      console.error("Error fetching permits:", err);
      return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/api/permits/update-status", (c: Context) => {
   const payload = c.get('jwtPayload');
   console.log("Updating permit status for user:", payload?.gh_login);
  return c.json({ message: `TODO: Update permit status for ${payload?.gh_login}` });
});

app.post("/api/scan/github", async (c: Context) => {
  const payload = c.get('jwtPayload');
  if (!supabase) return c.json({ error: "Database client not initialized" }, 500);
  const githubUserId = payload?.sub;

  if (!githubUserId) return c.json({ error: "Invalid token payload" }, 401);

  console.log(`Scan request received for user: ${payload?.gh_login} (ID: ${githubUserId})`);

  try {
    const { data: userData, error: userError } = await supabase
        .from(USERS_TABLE)
        .select('encrypted_github_token')
        .eq('github_id', githubUserId)
        .single();

    if (userError) {
        console.error("Error fetching user token from DB:", userError);
        const hint = userError.code === 'PGRST116' ? " User record not found or RLS prevents access." : "";
        return c.json({ error: `Could not retrieve GitHub token for scanning.${hint}` }, 500);
    }
    if (!userData?.encrypted_github_token) {
        console.error(`Encrypted GitHub token is missing for user ${payload?.gh_login}`);
        return c.json({ error: "GitHub token not configured for user." }, 500);
    }

    const decryptToken = (encrypted: string) => encrypted.replace('encrypted(', '').replace(')', ''); // Placeholder
    const userGithubToken = decryptToken(userData.encrypted_github_token);
    const userOctokit = new Octokit({ auth: userGithubToken });

    setTimeout(() => {
        scanGitHubForUser(userOctokit, githubUserId).catch(scanError => {
            console.error(`Background scan failed for user ${payload?.gh_login}:`, scanError);
        });
    }, 0);

    return c.json({ message: "GitHub scan initiated successfully. Results will appear shortly." });

  } catch (error) {
      console.error("Error initiating scan:", error);
      return c.json({ error: "Failed to initiate GitHub scan." }, 500);
  }
});

// --- Scanning Logic (Moved into API service) ---
async function scanGitHubForUser(userOctokit: Octokit, githubUserId: string) {
  // ... (Scanning logic remains largely the same) ...
  console.log(`Starting scan for user ${githubUserId} at ${new Date().toISOString()}`);
  const permitUrlRegex = new RegExp(`${FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?claim=([a-zA-Z0-9+/=]+)`);

  for (const repoPath of TARGET_REPOS) {
    const [owner, repo] = repoPath.split("/");
    if (!owner || !repo) continue;
    console.log(`  Scanning ${owner}/${repo} for user ${githubUserId}...`);

    try {
      const issuesPaginator = userOctokit.paginate.iterator(userOctokit.rest.issues.listForRepo, { owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 30 });
      for await (const { data: issues } of issuesPaginator) {
        for (const issue of issues) {
          console.log(`    Scanning issue #${issue.number}`);
          try {
            const commentsPaginator = userOctokit.paginate.iterator(userOctokit.rest.issues.listComments, { owner, repo, issue_number: issue.number, per_page: 50 });
            for await (const { data: comments } of commentsPaginator) {
              for (const comment of comments) {
                if (comment.body) {
                  const permitUrlMatch = comment.body.match(permitUrlRegex);
                  if (permitUrlMatch && permitUrlMatch[1]) {
                    console.log(`      Found potential permit in comment: ${comment.html_url}`);
                    await processPermitData(permitUrlMatch[1], comment.html_url, owner, repo, issue.number, githubUserId);
                  }
                }
              }
            }
          } catch (commentError) { console.error(`      Error scanning comments for issue #${issue.number}:`, commentError); }
        }
      }
    } catch (error) { console.error(`Error scanning issues for ${owner}/${repo}:`, error); }
  }
  console.log(`Scan finished for user ${githubUserId} at ${new Date().toISOString()}`);
}

async function processPermitData(base64Data: string, sourceUrl: string, owner: string, repo: string, issueNumber: number, githubUserId: string) {
  // ... (Permit processing logic remains largely the same) ...
   if (!supabase) return;
  try {
    const decodedJson = atob(base64Data);
    let permits;
    try { permits = JSON.parse(decodedJson); } catch (e) { console.error(`  Invalid JSON in ${sourceUrl}`, e); return; }
    const permitArray = Array.isArray(permits) ? permits : [permits];

    for (const permit of permitArray) {
      if (!permit || typeof permit !== 'object' || !permit.permit?.nonce || !permit.networkId) {
         console.warn(`  Skipping invalid permit structure from ${sourceUrl}:`, permit); continue;
      }
      const nonce = permit.permit.nonce.toString();

      console.log(`      Attempting to save permit nonce ${nonce} for user ${githubUserId}...`);
      const { error } = await supabase
        .from(PERMITS_TABLE)
        .upsert({
          nonce: nonce, network_id: permit.networkId, owner: permit.owner,
          beneficiary: permit.transferDetails?.to || permit.request?.beneficiary,
          permit_type: permit.type, token_address: permit.permit.permitted?.token,
          amount: permit.permit.permitted?.amount?.toString(),
          deadline: permit.permit.deadline?.toString(), signature: permit.signature,
          github_comment_url: sourceUrl, github_repo_owner: owner, github_repo_name: repo,
          github_issue_number: issueNumber, assigned_github_id: githubUserId,
          erc721_request: permit.type === 'erc721-permit' ? permit.request : null,
        }, { onConflict: 'nonce,network_id' });

      if (error) { console.error(`      Error saving permit nonce ${nonce} to Supabase:`, error); }
      else { console.log(`      Successfully saved/updated permit nonce ${nonce}.`); }
    }
  } catch (error) { console.error(`  Error processing permit data from ${sourceUrl}:`, error); }
}

// --- Server Start ---
initialize().then(() => {
  console.log("API server starting on http://localhost:8000");
  serve(app.fetch);
}).catch(err => {
  console.error("Failed to start server:", err);
  Deno.exit(1);
});
