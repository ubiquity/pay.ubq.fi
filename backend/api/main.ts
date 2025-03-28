import { serve } from "https://deno.land/std@0.177.0/http/server.ts"; // Use older std/http server
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"; // Import dotenv loader
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts"; // Import verify
// import { logger } from "https://deno.land/x/hono@v4.1.5/middleware/logger.ts"; // Commented out due to import errors
import { Context, Hono, Next } from "https://deno.land/x/hono@v4.1.5/mod.ts"; // Full URL
// Removed CORS import

// --- Load Environment Variables ---
await load({ export: true });

// --- Configuration ---
const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID");
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET");
const JWT_SECRET_KEY = Deno.env.get("JWT_SECRET");
let jwtKey: CryptoKey | null = null;

// --- Initialization ---
async function initializeJwtKey() {
  if (!JWT_SECRET_KEY) {
    console.error("FATAL: JWT_SECRET environment variable is not set.");
    Deno.exit(1);
  }
  try {
    const encoder = new TextEncoder();
    jwtKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(JWT_SECRET_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    console.log("JWT key initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize JWT key:", err);
    Deno.exit(1);
  }
}

const app = new Hono();

// --- Middleware ---

// Manual CORS Middleware - Applied FIRST to handle preflight OPTIONS requests correctly
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']; // Add production URL later

  // Set base CORS headers if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE'); // Specify allowed methods
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Specify allowed headers
    c.header('Access-Control-Allow-Credentials', 'true'); // Optional: If needed
  }

  // Handle OPTIONS preflight requests immediately
  if (c.req.method === 'OPTIONS') {
    // Ensure headers are set even for OPTIONS if origin is allowed
    if (origin && allowedOrigins.includes(origin)) {
        c.header('Access-Control-Max-Age', '86400'); // Cache preflight response for 1 day
    }
    return c.body(null, 204); // Respond with 204 No Content
  }

  // For non-OPTIONS requests, proceed to the next middleware/handler
  await next();
});

// app.use("*", logger()); // Commented out due to persistent import errors


// --- JWT Verification Middleware ---
const verifyJwtMiddleware = async (c: Context, next: Next) => {
  if (!jwtKey) {
    console.error("JWT key not initialized during verification.");
    return c.json({ error: "Server initialization error" }, 500);
  }
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return c.json({ error: "Missing authentication token" }, 401);
  }

  try {
    const payload = await verify(token, jwtKey);
    c.set('jwtPayload', payload);
    await next();
  } catch (_error) {
    console.error("JWT verification failed:", _error);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};

// --- Public Routes ---
app.get("/", (c: Context) => {
  return c.text("Permit Claiming API");
});

// --- GitHub OAuth Callback Route (public) ---
app.post("/api/auth/github/callback", async (c: Context) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    console.error("GitHub OAuth client ID or secret not configured on backend.");
    return c.json({ error: "Server configuration error" }, 500);
  }
  if (!jwtKey) {
     console.error("JWT key not initialized.");
     return c.json({ error: "Server initialization error" }, 500);
  }

  try {
    const { code } = await c.req.json();
    if (!code || typeof code !== 'string') {
      return c.json({ error: "Authorization code missing or invalid" }, 400);
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("GitHub token exchange failed:", tokenResponse.status, errorBody);
      return c.json({ error: "Failed to exchange code with GitHub" }, 500);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("Access token not found in GitHub response:", tokenData);
      return c.json({ error: "Failed to get access token from GitHub" }, 500);
    }

    // --- Temporarily Commented Out User Profile Fetch for Debugging ---
    // // 2. (Optional) Fetch GitHub user profile
    // const userResponse = await fetch("https://api.github.com/user", {
    //   headers: {
    //     "Authorization": `Bearer ${accessToken}`,
    //     "Accept": "application/json",
    //   },
    // });
    //
    // if (!userResponse.ok) {
    //   const errorBody = await userResponse.text();
    //   console.error("GitHub user fetch failed:", userResponse.status, errorBody);
    //   return c.json({ error: "Failed to fetch user profile from GitHub" }, 500);
    // }
    //
    // const githubUser = await userResponse.json();
    // console.log("GitHub User:", githubUser.login, githubUser.id);
    // --- End of Temporarily Commented Out Section ---

    // Use placeholder/dummy data since profile fetch is commented out
    const githubUser = {
        id: 'placeholder_id', // Replace with actual ID if needed later
        login: 'placeholder_login' // Replace with actual login if needed later
    };
    console.log("Skipped GitHub user fetch. Using placeholder data.");


    // 3. Find/Create user in your DB (Supabase) & Store GitHub Token
    console.log(`TODO: Store/update user ${githubUser.login} (ID: ${githubUser.id}) in DB with encrypted GitHub access token: ${accessToken}`);

    // 4. Generate Session Token (JWT)
    const payload = {
      gh_id: githubUser.id,
      gh_login: githubUser.login,
      exp: getNumericDate(60 * 60 * 24 * 7),
      iat: getNumericDate(0),
    };
    const jwt = await create({ alg: "HS256", typ: "JWT" }, payload, jwtKey);

    // 5. Return JWT to frontend
    return c.json({ token: jwt });

  } catch (error) {
    // Log the specific error for better debugging
    console.error("Error in GitHub callback handler:", error.message || error);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return c.json({ error: "Internal server error during GitHub callback" }, 500);
  }
});

// --- Authenticated Routes ---
app.use('/api/scan/*', verifyJwtMiddleware);
app.use('/api/permits/*', verifyJwtMiddleware);

app.get("/api/permits", (c: Context) => {
  const payload = c.get('jwtPayload');
  console.log("Fetching permits for user:", payload?.gh_login);
  return c.json({ message: `TODO: Fetch permits for ${payload?.gh_login}` });
});

app.post("/api/permits/update-status", (c: Context) => {
   const payload = c.get('jwtPayload');
   console.log("Updating permit status for user:", payload?.gh_login);
  return c.json({ message: `TODO: Update permit status for ${payload?.gh_login}` });
});

app.post("/api/scan/github", async (c: Context) => {
  const payload = c.get('jwtPayload');
  console.log(`Scan request received for user: ${payload?.gh_login} (ID: ${payload?.gh_id})`);
  const userGithubToken = "PLACEHOLDER_FETCH_DECRYPTED_TOKEN_FROM_DB";
  if (!userGithubToken || userGithubToken === "PLACEHOLDER_FETCH_DECRYPTED_TOKEN_FROM_DB") {
      console.error(`GitHub token not found or couldn't be decrypted for user ${payload?.gh_login}`);
      return c.json({ error: "Could not retrieve GitHub token for scanning." }, 500);
  }
  console.log("TODO: Implement GitHub scanning logic using user token:", userGithubToken);
  return c.json({ message: "GitHub scan initiated successfully." });
});

// --- Server Start ---
initializeJwtKey().then(() => {
  console.log("API server starting on http://localhost:8000");
  serve(app.fetch);
}).catch(err => {
  console.error("Failed to start server:", err);
  Deno.exit(1);
});
