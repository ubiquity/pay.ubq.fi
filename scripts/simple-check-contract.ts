/**
 * Simple Contract Check on Gnosis Chain
 *
 * This script uses the fetch API to check if a contract exists at the specified address
 * by making a direct JSON-RPC call to a Gnosis Chain node.
 *
 * Usage:
 *   bun run scripts/simple-check-contract.ts
 */

const CONTRACT_ADDRESS = "0xfa3b31d5B9F91C78360D618B5D6e74cBe930E10e";
const RPC_URL = "https://rpc.gnosischain.com";

async function main() {
  console.log("Simple Contract Check on Gnosis Chain");
  console.log("=====================================");
  console.log(`Target Contract: ${CONTRACT_ADDRESS}`);
  console.log(`RPC URL: ${RPC_URL}`);

  try {
    // 1. First check if the address has code (is a contract)
    console.log("\nChecking if address has code...");
    const codeResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [CONTRACT_ADDRESS, "latest"]
      })
    });

    const codeData = await codeResponse.json();

    if (codeData.error) {
      throw new Error(`RPC error: ${codeData.error.message}`);
    }

    const bytecode = codeData.result;

    if (!bytecode || bytecode === "0x") {
      console.log("❌ No contract deployed at this address");
      return { success: false, exists: false };
    }

    console.log("✅ Contract exists at the specified address");
    console.log(`Bytecode length: ${(bytecode.length - 2) / 2} bytes`);

    // 2. Check contract balance
    console.log("\nChecking contract balance...");
    const balanceResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getBalance",
        params: [CONTRACT_ADDRESS, "latest"]
      })
    });

    const balanceData = await balanceResponse.json();

    if (balanceData.error) {
      throw new Error(`RPC error: ${balanceData.error.message}`);
    }

    const balance = parseInt(balanceData.result, 16);
    console.log(`Contract balance: ${balance} wei`);

    // 3. Try to call PERMIT2() view function to verify it's our contract
    console.log("\nChecking if it's the PermitAggregator contract...");

    // Function signature for PERMIT2()
    const PERMIT2_SIGNATURE = "0x1e8bf69e"; // bytes4(keccak256("PERMIT2()"))

    const callResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "eth_call",
        params: [{
          to: CONTRACT_ADDRESS,
          data: PERMIT2_SIGNATURE
        }, "latest"]
      })
    });

    const callData = await callResponse.json();

    if (callData.error) {
      console.log(`❌ Could not call PERMIT2() function: ${callData.error.message}`);
      console.log("This might not be the expected PermitAggregator contract");
    } else {
      const permitAddress = callData.result;
      if (permitAddress && permitAddress !== "0x") {
        // Extract address from the result (it's padded to 32 bytes)
        const address = `0x${permitAddress.slice(26)}`;
        console.log(`✅ Successfully called PERMIT2() view function`);
        console.log(`PERMIT2 Address: ${address}`);

        // Check if it matches the expected Permit2 address
        const EXPECTED_PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
        if (address.toLowerCase() === EXPECTED_PERMIT2.toLowerCase()) {
          console.log(`✅ This is the expected PermitAggregator contract!`);
          console.log(`The PERMIT2 address matches the expected value.`);
        } else {
          console.log(`⚠️ The PERMIT2 address does not match the expected value:`);
          console.log(`Expected: ${EXPECTED_PERMIT2}`);
          console.log(`Actual: ${address}`);
        }
      } else {
        console.log(`❌ Call returned empty result`);
        console.log("This might not be the expected PermitAggregator contract");
      }
    }

    console.log("\nYou can view the contract on Gnosisscan:");
    console.log(`https://gnosisscan.io/address/${CONTRACT_ADDRESS}`);

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
