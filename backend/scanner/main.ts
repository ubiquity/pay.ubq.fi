import { Octokit } from "@octokit/rest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"; // Import dotenv loader

// --- Load Environment Variables ---
// Load .env file. Deno Deploy handles env vars differently, but this is good for local dev.
// The --allow-read and --allow-env flags are needed.
await load({ export: true }); // Export variables to Deno.env

// --- Configuration ---

// Environment Variables
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY"); // Use anon key for client-side library
const githubToken = Deno.env.get("GITHUB_TOKEN");
const frontendUrl = Deno.env.get("FRONTEND_URL") || "http://localhost:5173"; // Default for local dev

// Target Repositories (Consider moving to config file or env var)
const TARGET_REPOS = ["ubiquity/pay.ubq.fi"]; // Example: Update with actual target repo(s)

// --- Initialization ---

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.");
  Deno.exit(1);
}
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

if (!githubToken) {
  console.warn("GITHUB_TOKEN environment variable is not set. GitHub API calls will be rate-limited.");
}
const octokit = new Octokit({ auth: githubToken });

// --- Core Scanning Logic ---

/**
 * Scans target GitHub repositories for permit URLs in issue comments.
 */
async function scanGitHubForPermits() {
  console.log(`Starting GitHub permit scan at ${new Date().toISOString()}`);
  const permitUrlRegex = new RegExp(`${frontendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?claim=([a-zA-Z0-9+/=]+)`);

  for (const repoPath of TARGET_REPOS) {
    const [owner, repo] = repoPath.split("/");
    if (!owner || !repo) {
      console.error(`Invalid repo path format: ${repoPath}. Skipping.`);
      continue;
    }
    console.log(`Scanning ${owner}/${repo}...`);

    try {
      // Paginate through issues (newest first)
      const issuesPaginator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        state: "all", // Scan both open and closed issues
        sort: "updated", // Or 'created' - scan based on recent activity
        direction: "desc",
        per_page: 50, // Adjust page size as needed
      });

      for await (const { data: issues } of issuesPaginator) {
        for (const issue of issues) {
          console.log(`  Scanning issue #${issue.number}: ${issue.title}`);
          try {
            // Paginate through comments for the issue
            const commentsPaginator = octokit.paginate.iterator(octokit.rest.issues.listComments, {
              owner,
              repo,
              issue_number: issue.number,
              per_page: 100,
            });

            for await (const { data: comments } of commentsPaginator) {
              for (const comment of comments) {
                if (comment.body) {
                  const permitUrlMatch = comment.body.match(permitUrlRegex);
                  if (permitUrlMatch && permitUrlMatch[1]) {
                    const base64Data = permitUrlMatch[1];
                    console.log(`    Found potential permit in comment: ${comment.html_url}`);
                    await processPermitData(base64Data, comment.html_url, owner, repo, issue.number);
                  }
                }
              }
            }
          } catch (commentError) {
             console.error(`    Error scanning comments for issue #${issue.number}:`, commentError);
             // Continue to the next issue even if comments fail
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning issues for ${owner}/${repo}:`, error);
      // Continue to the next repo if issues fail
    }
  }

  console.log(`GitHub permit scan finished at ${new Date().toISOString()}`);
}

/**
 * Decodes, validates, and attempts to store permit data found in a comment.
 */
async function processPermitData(base64Data: string, sourceUrl: string, owner: string, repo: string, issueNumber: number) {
  try {
    // 1. Decode Base64
    const decodedJson = atob(base64Data);

    // 2. Parse JSON
    let permits;
    try {
      permits = JSON.parse(decodedJson);
    } catch (parseError) {
      console.error(`  Error parsing JSON from ${sourceUrl}:`, parseError);
      return; // Stop processing if JSON is invalid
    }

    // 3. Ensure it's an array
    const permitArray = Array.isArray(permits) ? permits : [permits];

    for (const permit of permitArray) {
      // 4. Basic Structure Validation (Placeholder - Use Zod for robust validation)
      if (!permit || typeof permit !== 'object' || !permit.permit?.nonce || !permit.networkId) {
         console.warn(`  Skipping invalid permit structure from ${sourceUrl}:`, permit);
         continue;
      }
      const nonce = permit.permit.nonce.toString(); // Ensure nonce is a string for DB consistency

      // 5. Upsert into Database (using nonce as conflict target)
      console.log(`    Attempting to save permit with nonce ${nonce}...`);
      const { data, error } = await supabase
        .from('permits') // TODO: Confirm actual table name
        .upsert({
          // --- Core Identifiers ---
          nonce: nonce,
          network_id: permit.networkId,
          owner: permit.owner, // Funder address
          beneficiary: permit.transferDetails?.to || permit.request?.beneficiary, // Recipient address

          // --- Permit Details ---
          permit_type: permit.type, // 'erc20-permit' or 'erc721-permit'
          token_address: permit.permit.permitted?.token,
          amount: permit.permit.permitted?.amount?.toString(), // Store large numbers as string
          deadline: permit.permit.deadline?.toString(), // Store large numbers as string
          signature: permit.signature,

          // --- Source Info ---
          github_comment_url: sourceUrl,
          github_repo_owner: owner,
          github_repo_name: repo,
          github_issue_number: issueNumber,

          // --- ERC721 Specific (Optional) ---
          // Store the request object directly or flatten its fields
          erc721_request: permit.type === 'erc721-permit' ? permit.request : null,
          // nft_metadata: permit.type === 'erc721-permit' ? permit.nftMetadata : null, // Alternative: flatten metadata

          // --- Status ---
          // claimed_at: null, // Initially null
          // transaction_hash: null, // Initially null
          // last_scanned_at: new Date().toISOString(), // Update scan time
        }, {
          onConflict: 'nonce,network_id', // Assumes nonce+network_id is unique constraint
          ignoreDuplicates: false, // Update existing records
        });

      if (error) {
        console.error(`    Error saving permit nonce ${nonce} to Supabase:`, error);
      } else {
        console.log(`    Successfully saved/updated permit nonce ${nonce}.`);
      }
    }
  } catch (error) {
    console.error(`  Error processing permit data from ${sourceUrl}:`, error);
  }
}

// --- DEPRECATED Cron Job / Manual Trigger ---
// The scanning logic has been moved to the API service (`backend/api/main.ts`)
// and is triggered on behalf of an authenticated user via the `/api/scan/github` endpoint.
// This standalone scanner file might be repurposed for other background tasks
// or removed entirely. The cron job below is no longer relevant for user-specific scans.

/*
// --- Deno Deploy Cron Handler ---
// See: https://deno.com/deploy/docs/tasks-and-cron-jobs
// Ensure this file is the entry point specified in your Deno Deploy project settings.
Deno.cron("github-permit-scanner", "0 * * * *", async () => { // Example: Run hourly
  console.log("Cron job triggered: github-permit-scanner");
  // await scanGitHubForPermits(); // This used a global token, which is incorrect.
});
*/

/*
// --- Manual Execution ---
// Run with: deno run --allow-net --allow-env --allow-read main.ts
if (import.meta.main) {
  console.log("Manual execution triggered.");
  // await scanGitHubForPermits(); // This used a global token, which is incorrect.
}
*/

console.log("Standalone scanner entry point. NOTE: Core scanning logic moved to API service.");
