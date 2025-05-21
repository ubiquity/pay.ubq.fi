/**
 * Check Contract on Gnosis Chain
 *
 * This script checks if a contract exists at the specified address
 * on Gnosis Chain by querying its bytecode directly from the blockchain.
 *
 * Usage:
 *   bun run scripts/check-gnosis-contract.ts
 */

import { createPublicClient, http, isAddress, getAddress } from "viem";
import { gnosis } from "viem/chains";

// Target contract address on Gnosis Chain
const CONTRACT_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

async function main() {
  console.log("Checking Contract on Gnosis Chain");
  console.log("=================================");
  console.log(`Target Contract: ${CONTRACT_ADDRESS}`);

  try {
    // Validate the address
    if (!isAddress(CONTRACT_ADDRESS)) {
      throw new Error("Invalid contract address format");
    }

    const checksumAddress = getAddress(CONTRACT_ADDRESS);
    console.log(`Checksum Address: ${checksumAddress}`);

    // Create a public client to connect to Gnosis Chain
    const client = createPublicClient({
      chain: gnosis,
      transport: http("https://rpc.gnosischain.com")
    });

    console.log("\nFetching contract bytecode...");
    const bytecode = await client.getBytecode({
      address: checksumAddress
    });

    if (!bytecode || bytecode === "0x") {
      console.log("❌ No contract deployed at this address");
      return { success: false, exists: false };
    }

    console.log("✅ Contract exists at the specified address");
    console.log(`Bytecode length: ${(bytecode.length - 2) / 2} bytes`);

    // Get contract metadata if possible
    try {
      console.log("\nAttempting to fetch contract metadata...");

      // Get contract creation details
      const blockNumber = await client.getBlockNumber();
      console.log(`Current block number: ${blockNumber}`);

      // Get balance
      const balance = await client.getBalance({
        address: checksumAddress,
      });
      console.log(`Contract balance: ${balance} wei`);

      // Try to call PERMIT2 view function if it exists
      try {
        const permitAddress = await client.readContract({
          address: checksumAddress,
          abi: [
            {
              inputs: [],
              name: "PERMIT2",
              outputs: [{ type: "address", name: "" }],
              stateMutability: "view",
              type: "function"
            }
          ],
          functionName: "PERMIT2",
        });

        console.log(`✅ Successfully called PERMIT2() view function`);
        console.log(`PERMIT2 Address: ${permitAddress}`);
        console.log(`This confirms it's likely the expected PermitAggregator contract`);
      } catch (err) {
        console.log(`❌ Could not call PERMIT2() view function: ${(err as Error).message}`);
        console.log("This might not be the expected PermitAggregator contract");
      }
    } catch (metaErr) {
      console.log(`Failed to fetch additional metadata: ${(metaErr as Error).message}`);
    }

    console.log("\nYou can view the contract on Gnosisscan:");
    console.log(`https://gnosisscan.io/address/${checksumAddress}`);

    return { success: true, exists: true };
  } catch (error) {
    console.error(`\n❌ Error checking contract: ${(error as Error).message}`);

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
