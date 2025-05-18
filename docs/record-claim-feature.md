# Implementation Plan: Record Claim Transaction in Database

**Date:** 2025-04-02

**Goal:** Securely update the `transaction` column in the Supabase `permits` table with the transaction hash when a user successfully claims a permit via the frontend.

**Approach:** Hybrid approach using a bundled backend API endpoint within the existing Deno Deploy frontend server. The frontend sends the claim details, and the backend verifies the claimer matches the permit's beneficiary before updating the database.

## 1. Backend Modifications (`frontend/server.ts`)

*   **Dependencies:**
    *   Ensure `hono` is imported.
    *   Add `@supabase/supabase-js` dependency to `frontend/deno.json` if not already present.
    *   Import necessary Supabase types/client creator.
*   **Supabase Client Initialization:**
    *   Create a Supabase client instance using environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The service role key is required for backend updates bypassing RLS if necessary. Ensure these variables are set as secrets in Deno Deploy.
    ```typescript
    import { createClient } from "@supabase/supabase-js";
    // ... other imports

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
      // Potentially throw an error or handle gracefully
    }

    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    ```
*   **API Endpoint Definition:**
    *   Use the existing Hono `app` instance (or create a dedicated `api` sub-router if preferred).
    *   Define a `POST` route for `/api/permits/record-claim`.
    ```typescript
    // ... inside server setup ...
    app.post('/api/permits/record-claim', async (c) => {
      // ... implementation below ...
    });
    ```
*   **Endpoint Logic (`/api/permits/record-claim`):**
    1.  **Parse Request Body:**
        *   Get JSON body using `await c.req.json()`.
        *   Validate expected fields: `permitId` (number or string, depending on DB schema), `transactionHash` (string, starting with `0x`), `claimerAddress` (string, Ethereum address format). Return 400 Bad Request if validation fails.
    2.  **Fetch Permit Beneficiary:**
        *   Query the `permits` table using `supabaseAdmin`.
        *   Select the `beneficiary` column.
        *   Filter using `eq('id', permitId)`.
        *   Use `.single()` to expect only one result.
        *   Handle potential errors (e.g., permit not found -> return 404, database error -> return 500).
    3.  **Security Check:**
        *   Compare the `claimerAddress` from the request body (case-insensitive) with the fetched `beneficiary` address (case-insensitive).
        *   If they do **not** match, return 403 Forbidden.
    4.  **Update Database:**
        *   If the addresses match, perform an update query on the `permits` table.
        *   Set the `transaction` column to the provided `transactionHash`.
        *   Filter using `eq('id', permitId)`.
        *   Handle potential database update errors (return 500).
    5.  **Return Response:**
        *   On success, return 200 OK with a simple JSON body like `{ success: true }`.
        *   On failure (validation, not found, forbidden, DB error), return the appropriate status code and error message.

## 2. Frontend Modifications (`frontend/src/hooks/use-permit-claiming.ts`)

*   **Locate Success Handler:** Find the `useEffect` hook that depends on `isClaimConfirmed`, `claimReceipt`, and `claimTxHash`. This hook runs when `useWaitForTransactionReceipt` confirms the transaction.
*   **Add API Call:** Inside the `if (isClaimConfirmed && ...)` block, *after* the `setPermits` and `updatePermitStatusCache` calls:
    1.  **Find Permit ID:** Retrieve the database `id` of the permit associated with the successful `claimTxHash`. This might require ensuring the `id` is available within the `PermitData` type and fetched/cached correctly by `usePermitData`. If not currently available, update `PermitData` type and fetching logic first.
    2.  **Construct Request Body:** Create an object containing `permitId`, `transactionHash` (which is `claimTxHash`), and `claimerAddress` (which is the connected `address` from `useAccount`).
    3.  **Make Fetch Request:** Use the browser's `fetch` API to send a `POST` request to `/api/permits/record-claim` (relative path, as it's bundled).
        *   Set `method: 'POST'`.
        *   Set `headers: { 'Content-Type': 'application/json' }`.
        *   Set `body: JSON.stringify(...)` with the constructed body.
    4.  **Handle Response (Optional but Recommended):**
        *   Check if the response status is OK (e.g., `response.ok` or `response.status === 200`).
        *   Log success or failure of the recording attempt to the console. Explicit UI feedback for this backend update might not be necessary unless specifically required. Handle potential network errors during the fetch.

```typescript
// Inside the useEffect for successful confirmation
useEffect(() => {
  if (isClaimConfirmed && claimReceipt && claimTxHash && address) { // Added address check
    let claimedPermitKey: string | null = null;
    let permitToRecord: PermitData | undefined = undefined; // Find the permit object

    setPermits((current) =>
      current.map((p) => {
        if (p.transactionHash === claimTxHash) {
          claimedPermitKey = `${p.nonce}-${p.networkId}`;
          permitToRecord = p; // Store the permit object
          return { ...p, claimStatus: "Success", status: "Claimed", claimError: undefined };
        }
        return p;
      })
    );

    if (claimedPermitKey) {
      updatePermitStatusCache(claimedPermitKey, { isNonceUsed: true, checkError: undefined });

      // --->>> NEW: Record claim in DB <<<---
      if (permitToRecord && permitToRecord.id) { // Ensure we have the permit and its DB ID
        const recordData = {
          permitId: permitToRecord.id,
          transactionHash: claimTxHash,
          claimerAddress: address // Use the connected address
        };

        fetch('/api/permits/record-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData),
        })
        .then(response => {
          if (!response.ok) {
            console.error(`Failed to record claim for permit ${recordData.permitId}. Status: ${response.status}`);
            // Optionally set a non-critical UI warning?
          } else {
            // console.log(`Successfully recorded claim for permit ${recordData.permitId}`);
          }
        })
        .catch(error => {
          console.error(`Network error recording claim for permit ${recordData.permitId}:`, error);
          // Optionally set a non-critical UI warning?
        });
      } else {
         console.warn(`Could not record claim for tx ${claimTxHash}: Permit data or ID missing.`);
      }
      // --->>> END NEW <<<---
    }
  }
// Added address to dependency array
}, [isClaimConfirmed, claimReceipt, claimTxHash, setPermits, updatePermitStatusCache, address]);
```

## 3. Database Schema (`permits` table)

*   Verify the table contains:
    *   `id`: Primary key (type `number` or `string`).
    *   `beneficiary`: Column storing the beneficiary's Ethereum address (type `text` or `varchar`).
    *   `transaction`: Column to store the transaction hash (type `text` or `varchar`, nullable).
    *   `nonce`: Column storing the permit nonce (type `numeric` or `text`).

## 4. Environment Variables & Deployment

*   **Secrets:** Add `SUPABASE_SERVICE_ROLE_KEY` to Deno Deploy project secrets alongside `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
*   **Deployment:** Redeploy the Deno Deploy project linked to `frontend/server.ts` after merging the code changes. No changes should be needed for the deployment script itself.

## 5. Testing

*   Test the successful claim flow and verify the `transaction` column is updated in Supabase.
*   Test attempting to call the API endpoint directly (e.g., using `curl` or Postman) with incorrect data or a mismatched `claimerAddress` to ensure 4xx errors are returned.
*   Test the frontend behavior when the API call fails (ensure no critical errors, console logs are informative).
