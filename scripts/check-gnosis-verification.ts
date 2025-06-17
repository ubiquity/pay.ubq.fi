/**
 * Check Gnosis Chain Contract Verification Status
 *
 * This script checks if a contract is already verified on Gnosis Chain
 * by attempting to fetch its source code from the Gnosisscan API.
 *
 * Usage:
 *   bun run scripts/check-gnosis-verification.ts
 */

import axios from "axios";

// Target contract address on Gnosis Chain with correct capitalization
const CONTRACT_ADDRESS = "0xfa3b31d5B9F91C78360D618B5D6e74cBe930E10e";

// Gnosisscan API endpoint and key
const API_URL = "https://api.gnosisscan.io/api";
const API_KEY = "89SNHUCI1TAXG7HWUNW9Z1ZYXT93G22HHQ";

async function main() {
  console.log("Checking verification status on Gnosis Chain");
  console.log("===========================================");
  console.log(`Target Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Explorer: https://gnosisscan.io/address/${CONTRACT_ADDRESS}`);

  try {
    // Check if we can get the contract ABI (only available for verified contracts)
    console.log("\nAttempting to fetch contract ABI...");
    const abiParams = new URLSearchParams({
      module: "contract",
      action: "getabi",
      address: CONTRACT_ADDRESS,
      apikey: API_KEY
    });

    const abiResponse = await axios.get(`${API_URL}?${abiParams.toString()}`);
    console.log("ABI Response:", abiResponse.data);

    // Check if contract source code is available
    console.log("\nAttempting to fetch contract source code...");
    const sourceParams = new URLSearchParams({
      module: "contract",
      action: "getsourcecode",
      address: CONTRACT_ADDRESS,
      apikey: API_KEY
    });

    const sourceResponse = await axios.get(`${API_URL}?${sourceParams.toString()}`);
    console.log("Source Code Response:", sourceResponse.data);

    // Check if contract is verified
    if (abiResponse.data.status === "1" && sourceResponse.data.status === "1") {
      const sourceResult = sourceResponse.data.result[0];

      if (sourceResult.SourceCode && sourceResult.SourceCode.length > 0) {
        console.log("\n✅ Contract is already verified!");
        console.log(`Contract name: ${sourceResult.ContractName}`);
        console.log(`Compiler version: ${sourceResult.CompilerVersion}`);
        console.log(`Optimization: ${sourceResult.OptimizationUsed === "1" ? "Yes" : "No"}`);

        if (sourceResult.Implementation && sourceResult.Implementation !== "") {
          console.log(`Implementation (proxy): ${sourceResult.Implementation}`);
        }

        console.log(`\nView verified contract: https://gnosisscan.io/address/${CONTRACT_ADDRESS}#code`);
      } else {
        console.log("\n❌ Contract is NOT verified");
        console.log("The source code is not available on Gnosisscan");
      }
    } else {
      console.log("\n❌ Contract is NOT verified");
      console.log("Could not fetch contract ABI or source code");
    }
  } catch (error) {
    console.error(`\n❌ Error checking verification status: ${(error as Error).message}`);

    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:", error.stack);
    }

    return { success: false, error: String(error) };
  }
}

// Run the script
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
