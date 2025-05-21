/**
 * Gnosis Chain Contract Verification Script
 *
 * This script verifies the PermitAggregator contract on Gnosis Chain (gnosisscan.io)
 * using the Gnosisscan API directly.
 *
 * Usage:
 *   bun run scripts/verify-gnosis-contract.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import axios from "axios";
import { setTimeout } from "node:timers/promises";

// Target contract address on Gnosis Chain with correct capitalization
const CONTRACT_ADDRESS = "0xfa3b31d5B9F91C78360D618B5D6e74cBe930E10e";

// Gnosisscan API key
const GNOSISSCAN_API_KEY = "89SNHUCI1TAXG7HWUNW9Z1ZYXT93G22HHQ";

// Define Gnosis Chain configuration
const GNOSIS_CHAIN = {
  chainId: 100,
  name: "Gnosis Chain",
  explorerUrl: "https://gnosisscan.io",
  apiUrl: "https://api.gnosisscan.io/api", // Use Gnosisscan API directly
};

/**
 * Verify a contract on Gnosisscan
 * @param contractAddress Contract address
 * @param sourceCode Contract source code
 * @param apiKey Gnosisscan API key
 * @returns True if verification was successful, false otherwise
 */
async function verifyGnosisContract(
  contractAddress: string,
  sourceCode: string,
  apiKey: string
): Promise<boolean> {
  console.log(`Verifying contract on ${GNOSIS_CHAIN.name}...`);

  // Define API parameters - using direct API parameters for Gnosisscan
  const params = new URLSearchParams();
  params.append("apikey", apiKey);
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("contractaddress", contractAddress);
  params.append("sourceCode", sourceCode); // Single file format
  params.append("codeformat", "solidity-single-file");
  params.append("contractname", "PermitAggregator"); // Just the contract name without sol file extension
  params.append("compilerversion", "v0.8.20+commit.a1b79de6"); // Match the solidity version from the contract
  params.append("optimizationUsed", "1");
  params.append("runs", "200");
  params.append("constructorArguments", "000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3"); // PERMIT2_ADDRESS encoded
  params.append("licenseType", "3"); // MIT License

  try {
    // Submit verification request
    console.log("Submitting verification request to Gnosisscan API...");
    const response = await axios.post(GNOSIS_CHAIN.apiUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("API Response:", response.data);

    if (response.data.status !== "1") {
      console.error(`Verification submission failed: ${response.data.result}`);
      return false;
    }

    const guid = response.data.result;
    console.log(`Verification submitted with GUID: ${guid}`);
    console.log("Waiting for verification result...");

    // Check verification status with exponential backoff
    let verified = false;
    for (let i = 0; i < 10; i++) {
      // Wait before checking status
      const delay = Math.min(2000 * Math.pow(1.5, i), 30000); // Max 30 seconds
      await setTimeout(delay);

      // Check verification status
      const statusParams = new URLSearchParams();
      statusParams.append("apikey", apiKey);
      statusParams.append("module", "contract");
      statusParams.append("action", "checkverifystatus");
      statusParams.append("guid", guid);

      const statusResponse = await axios.get(`${GNOSIS_CHAIN.apiUrl}?${statusParams.toString()}`);
      console.log("Status check response:", statusResponse.data);

      if (statusResponse.data.status === "1") {
        console.log(`Verification successful: ${statusResponse.data.result}`);
        verified = true;
        break;
      } else if (statusResponse.data.result === "Pending in queue") {
        console.log(`Verification still pending, waiting...`);
      } else {
        console.error(`Verification failed: ${statusResponse.data.result}`);
        break;
      }
    }

    return verified;
  } catch (err) {
    console.error(`Verification request failed: ${(err as Error).message}`);
    if (err instanceof Error && err.stack) {
      console.error("\nStack trace:", err.stack);
    }
    return false;
  }
}

/**
 * Main verification function
 */
async function main() {
  console.log("Gnosis Chain Contract Verification");
  console.log("==================================");
  console.log(`Target Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Explorer: ${GNOSIS_CHAIN.explorerUrl}`);

  // Using the dedicated Gnosisscan API key
  const apiKey = GNOSISSCAN_API_KEY;
  console.log(`Using Gnosisscan API Key: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`);

  console.log("\nReading contract source code...");

  // Read the contract source code
  const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
  let sourceCode;

  try {
    sourceCode = readFileSync(contractPath, "utf8");
    console.log(`Contract source code loaded from ${contractPath}`);
  } catch (err) {
    console.error(`Failed to read contract file: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log("\nSubmitting verification request...");

  try {
    // Attempt to verify the contract
    const success = await verifyGnosisContract(
      CONTRACT_ADDRESS,
      sourceCode,
      apiKey
    );

    if (success) {
      console.log("\n✅ Contract verification successful!");
      console.log(`View verified contract: ${GNOSIS_CHAIN.explorerUrl}/address/${CONTRACT_ADDRESS}#code`);
    } else {
      console.error("\n❌ Contract verification failed");
      console.log("Possible reasons for failure:");
      console.log("- Contract may be already verified");
      console.log("- Compiler version mismatch");
      console.log("- Constructor arguments mismatch");
      console.log("- Source code doesn't match the deployed bytecode");
      console.log(`Check contract status: ${GNOSIS_CHAIN.explorerUrl}/address/${CONTRACT_ADDRESS}`);
    }

    return { success };
  } catch (error) {
    console.error(`\n❌ Verification error: ${(error as Error).message}`);

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
