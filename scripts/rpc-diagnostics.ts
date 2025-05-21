/**
 * RPC Diagnostics Tool for Gnosis Chain
 *
 * This script tests multiple RPC endpoints for Gnosis Chain and performs
 * various consistency checks to identify potential issues and discrepancies.
 */

import { createPublicClient, http, getAddress, PublicClient } from "npm:viem";
import { privateKeyToAccount } from "npm:viem/accounts";
import { setTimeout } from "node:timers/promises";

// Configuration
const GNOSIS_RPC_ENDPOINTS = [
  "https://rpc.ubq.fi/100",
  "https://rpc.gnosischain.com",
  "https://gnosis-mainnet.public.blastapi.io",
  "https://rpc.ankr.com/gnosis",
];

const TEST_ADDRESSES = [
  "0x000000000022D473030F116dDEE9F6B43aC78BA3", // Permit2
  "0x4e59b44847b379578588920cA78FbF26c0B4956C", // Create2 Factory
  "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e", // Deployed PermitAggregator
];

// Type definitions for our result objects
interface BytecodeCheck {
  exists: boolean;
  size: number;
  latency: number;
}

interface SuccessfulResult {
  endpoint: string;
  connected: true;
  chainId: number;
  latency: number;
  blockNumber?: number;
  blockLatency?: number;
  blockHash?: string;
  blockTimestamp?: string;
  gasPrice?: number;
  gasPriceLatency?: number;
  fixedBlockHash?: string;
  fixedBlockLatency?: number;
  fixedBlockError?: string;
  bytecodeChecks?: Record<string, BytecodeCheck>;
}

interface FailedResult {
  endpoint: string;
  connected: false;
  error: string;
}

type RpcResult = SuccessfulResult | FailedResult;

// Setup consistent chain config for fair comparisons
function createGnosisClient(rpcUrl: string) {
  return createPublicClient({
    chain: {
      id: 100,
      name: "Gnosis Chain",
      nativeCurrency: {
        name: "xDAI",
        symbol: "xDAI",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [rpcUrl],
        },
      },
    },
    transport: http(rpcUrl, {
      retryCount: 2,
      retryDelay: 1000,
      timeout: 15000,
    }),
  });
}

// Functional tests
async function testRpcEndpoint(rpcUrl: string): Promise<RpcResult> {
  console.log(`\n🔍 Testing RPC endpoint: ${rpcUrl}`);
  const results: Partial<SuccessfulResult> = { endpoint: rpcUrl };
  let client: PublicClient;

  try {
    // Create client
    console.log("  Creating client...");
    client = createGnosisClient(rpcUrl);

    // Basic connectivity test
    console.log("  Testing basic connectivity...");
    const startTime = performance.now();
    const chainId = await client.getChainId();
    const latency = Math.round(performance.now() - startTime);
    results.chainId = chainId;
    results.latency = latency;
    results.connected = true;
    console.log(`  ✅ Connected successfully! Chain ID: ${chainId}, Latency: ${latency}ms`);

    // Get block info
    console.log("  Fetching latest block...");
    const blockStart = performance.now();
    const latestBlock = await client.getBlock({ includeTransactions: false });
    results.blockNumber = Number(latestBlock.number);
    results.blockLatency = Math.round(performance.now() - blockStart);
    results.blockHash = latestBlock.hash;
    results.blockTimestamp = new Date(Number(latestBlock.timestamp) * 1000).toISOString();
    console.log(`  ✅ Latest block: ${results.blockNumber} (${results.blockTimestamp})`);

    // Check contract code existence
    results.bytecodeChecks = {};
    console.log("  Checking bytecode for test addresses...");
    for (const address of TEST_ADDRESSES) {
      const bytecodeStart = performance.now();
      const bytecode = await client.getBytecode({ address: getAddress(address) });
      const bytecodeLatency = Math.round(performance.now() - bytecodeStart);

      results.bytecodeChecks[address] = {
        exists: bytecode !== null && bytecode !== "0x",
        size: bytecode ? bytecode.length : 0,
        latency: bytecodeLatency
      };

      console.log(`  - ${address}: ${bytecode ? "✅ Code exists" : "❌ No code"} (${bytecodeLatency}ms)`);
    }

    // Check gas price
    console.log("  Fetching gas price...");
    const gasPriceStart = performance.now();
    const gasPrice = await client.getGasPrice();
    results.gasPrice = Number(gasPrice) / 1e9;
    results.gasPriceLatency = Math.round(performance.now() - gasPriceStart);
    console.log(`  ✅ Gas price: ${results.gasPrice} gwei (${results.gasPriceLatency}ms)`);

    // Fetch a known past block for consistency check
    try {
      console.log("  Fetching a specific past block for consistency check...");
      const fixedBlockStart = performance.now();
      // Use a block from a few days ago that should be finalized across all nodes
      const fixedBlock = await client.getBlock({ blockNumber: BigInt(30000000) });
      results.fixedBlockHash = fixedBlock.hash;
      results.fixedBlockLatency = Math.round(performance.now() - fixedBlockStart);
      console.log(`  ✅ Block #30000000 hash: ${fixedBlock.hash}`);
    } catch (err) {
      results.fixedBlockError = (err as Error).message;
      console.log(`  ❌ Failed to fetch specific block: ${(err as Error).message}`);
    }

    return results as SuccessfulResult;
  } catch (err) {
    console.log(`  ❌ Failed to connect: ${(err as Error).message}`);
    return {
      endpoint: rpcUrl,
      connected: false,
      error: (err as Error).message
    };
  }
}

// Type guard to check if a result is successful
function isSuccessfulResult(result: RpcResult): result is SuccessfulResult {
  return result.connected === true;
}

// Compare results between different RPC endpoints
function compareResults(allResults: RpcResult[]) {
  console.log("\n\n🔍 COMPARISON BETWEEN RPC ENDPOINTS:");

  // Print comparison table header
  console.log("\n📊 Basic Connectivity:");
  console.log("+--------------------------+------------+------------+------------+");
  console.log("| Endpoint                 | Connected  | Chain ID   | Latency    |");
  console.log("+--------------------------+------------+------------+------------+");

  for (const result of allResults) {
    console.log(
      `| ${result.endpoint.padEnd(24)} | ${
        result.connected ? "✅" : "❌"
      } | ${String(isSuccessfulResult(result) ? result.chainId : "N/A").padEnd(10)} | ${
        String(isSuccessfulResult(result) ? `${result.latency}ms` : "N/A").padEnd(10)
      } |`
    );
  }
  console.log("+--------------------------+------------+------------+------------+");

  // Only compare connected endpoints for deeper analysis
  const connectedResults = allResults.filter(isSuccessfulResult);
  if (connectedResults.length < 2) {
    console.log("\n⚠️ Not enough connected endpoints to perform comparison.");
    return;
  }

  // Block information comparison
  console.log("\n📊 Latest Block Information:");
  console.log("+--------------------------+-------------+-------------+-------------------------+");
  console.log("| Endpoint                 | Block Number| Block Hash  | Timestamp               |");
  console.log("+--------------------------+-------------+-------------+-------------------------+");

  for (const result of connectedResults) {
    console.log(
      `| ${result.endpoint.padEnd(24)} | ${
        String(result.blockNumber || "N/A").padEnd(11)
      } | ${(result.blockHash ? result.blockHash.substring(0, 10) + "..." : "N/A").padEnd(11)} | ${
        String(result.blockTimestamp || "N/A").padEnd(23)
      } |`
    );
  }
  console.log("+--------------------------+-------------+-------------+-------------------------+");

  // Gas price comparison
  console.log("\n📊 Gas Price Information:");
  console.log("+--------------------------+-------------+");
  console.log("| Endpoint                 | Gas Price   |");
  console.log("+--------------------------+-------------+");

  for (const result of connectedResults) {
    console.log(
      `| ${result.endpoint.padEnd(24)} | ${
        String(result.gasPrice ? `${result.gasPrice} gwei` : "N/A").padEnd(11)
      } |`
    );
  }
  console.log("+--------------------------+-------------+");

  // Historical block check (consistency check)
  console.log("\n📊 Historical Block Consistency Check (Block #30000000):");
  console.log("+--------------------------+--------------------------------------+");
  console.log("| Endpoint                 | Block Hash                           |");
  console.log("+--------------------------+--------------------------------------+");

  const blockHashes = new Set<string>();
  for (const result of connectedResults) {
    if (result.fixedBlockHash) {
      blockHashes.add(result.fixedBlockHash);
    }
    console.log(
      `| ${result.endpoint.padEnd(24)} | ${
        String(result.fixedBlockHash || result.fixedBlockError || "N/A").padEnd(36)
      } |`
    );
  }
  console.log("+--------------------------+--------------------------------------+");

  // Check for inconsistencies
  if (blockHashes.size > 1) {
    console.log("\n⚠️ INCONSISTENCY DETECTED: Different historical block hashes returned by different endpoints!");
    console.log("This indicates potential chain state inconsistencies or out-of-sync nodes.");
  } else if (blockHashes.size === 1) {
    console.log("\n✅ All responsive RPC endpoints returned the same historical block hash.");
  }

  // Bytecode checks
  console.log("\n📊 Contract Bytecode Existence Checks:");
  console.log("+--------------------------+----------------------+----------------------+----------------------+");
  console.log("| Endpoint                 | Permit2              | Create2 Factory      | PermitAggregator     |");
  console.log("+--------------------------+----------------------+----------------------+----------------------+");

  for (const result of connectedResults) {
    if (!result.bytecodeChecks) continue;

    const formatStatus = (address: string) => {
      const check = result.bytecodeChecks?.[address];
      if (!check) return "N/A";
      return check.exists ? `✅ ${Math.round(check.size/2)} bytes` : "❌ No code";
    };

    console.log(
      `| ${result.endpoint.padEnd(24)} | ${
        formatStatus(TEST_ADDRESSES[0]).padEnd(20)
      } | ${
        formatStatus(TEST_ADDRESSES[1]).padEnd(20)
      } | ${
        formatStatus(TEST_ADDRESSES[2]).padEnd(20)
      } |`
    );
  }
  console.log("+--------------------------+----------------------+----------------------+----------------------+");

  // Check bytecode inconsistencies
  const bytecodeInconsistencies = [];
  for (const address of TEST_ADDRESSES) {
    const sizes = new Set();
    const exists = new Set();

    for (const result of connectedResults) {
      if (result.bytecodeChecks && result.bytecodeChecks[address]) {
        sizes.add(result.bytecodeChecks[address].size);
        exists.add(result.bytecodeChecks[address].exists);
      }
    }

    if (sizes.size > 1 || exists.size > 1) {
      bytecodeInconsistencies.push(address);
    }
  }

  if (bytecodeInconsistencies.length > 0) {
    console.log("\n⚠️ INCONSISTENCY DETECTED: Different bytecode returned for these addresses:");
    bytecodeInconsistencies.forEach(addr => console.log(`- ${addr}`));
    console.log("This could indicate different chain states or nodes syncing from different checkpoints.");
  } else {
    console.log("\n✅ All responsive RPC endpoints returned consistent contract bytecode.");
  }
}

// Main function
async function main() {
  console.log("🔍 RPC DIAGNOSTICS FOR GNOSIS CHAIN");
  console.log("==================================");
  console.log("Testing multiple RPC endpoints for consistency and reliability.");

  const allResults: RpcResult[] = [];

  // Test each endpoint
  for (const rpcUrl of GNOSIS_RPC_ENDPOINTS) {
    try {
      const result = await testRpcEndpoint(rpcUrl);
      allResults.push(result);
      // Small delay between tests to avoid rate limiting
      await setTimeout(1000);
    } catch (err) {
      console.error(`Error testing ${rpcUrl}:`, err);
      allResults.push({
        endpoint: rpcUrl,
        connected: false,
        error: (err as Error).message
      });
    }
  }

  // Compare results
  compareResults(allResults);

  // Detailed analysis of ubq.fi RPC
  const ubqResult = allResults.find(r => r.endpoint.includes("ubq.fi"));
  if (ubqResult && isSuccessfulResult(ubqResult)) {
    console.log("\n\n🔍 DETAILED ANALYSIS OF rpc.ubq.fi/100");
    console.log("=====================================");

    if (ubqResult.latency > 1000) {
      console.log("⚠️ High latency detected: This could lead to timeouts or slow responses.");
    }

    // Check for bytecode inconsistencies specifically with ubq.fi
    const otherResults = allResults.filter(r => isSuccessfulResult(r) && !r.endpoint.includes("ubq.fi")) as SuccessfulResult[];
    const inconsistencies = [];

    for (const address of TEST_ADDRESSES) {
      if (!ubqResult.bytecodeChecks || !ubqResult.bytecodeChecks[address]) continue;

      const ubqCodeExists = ubqResult.bytecodeChecks[address].exists;
      const ubqCodeSize = ubqResult.bytecodeChecks[address].size;

      for (const other of otherResults) {
        if (!other.bytecodeChecks || !other.bytecodeChecks[address]) continue;

        if (ubqCodeExists !== other.bytecodeChecks[address].exists ||
            ubqCodeSize !== other.bytecodeChecks[address].size) {
          inconsistencies.push({
            address,
            ubq: { exists: ubqCodeExists, size: ubqCodeSize },
            other: {
              endpoint: other.endpoint,
              exists: other.bytecodeChecks[address].exists,
              size: other.bytecodeChecks[address].size
            }
          });
        }
      }
    }

    if (inconsistencies.length > 0) {
      console.log("⚠️ rpc.ubq.fi/100 returned different bytecode compared to other endpoints:");
      for (const inc of inconsistencies) {
        console.log(`- Address ${inc.address}:`);
        console.log(`  rpc.ubq.fi/100: ${inc.ubq.exists ? `Code exists (${Math.round(inc.ubq.size/2)} bytes)` : "No code"}`);
        console.log(`  ${inc.other.endpoint}: ${inc.other.exists ? `Code exists (${Math.round(inc.other.size/2)} bytes)` : "No code"}`);
      }
      console.log("\nThis confirms the issue with rpc.ubq.fi/100 returning different chain state data.");
    } else {
      console.log("✅ rpc.ubq.fi/100 returned consistent bytecode with other endpoints.");
    }

    // Check if the historical block hash is different
    const otherBlockHashes = otherResults
      .filter(r => r.fixedBlockHash)
      .map(r => r.fixedBlockHash);

    if (otherBlockHashes.length > 0 &&
        ubqResult.fixedBlockHash &&
        !otherBlockHashes.includes(ubqResult.fixedBlockHash)) {
      console.log("\n⚠️ rpc.ubq.fi/100 returned a different historical block hash:");
      console.log(`  rpc.ubq.fi/100: ${ubqResult.fixedBlockHash}`);
      console.log(`  Others: ${otherBlockHashes[0]}`);
      console.log("\nThis suggests the RPC might be synced to a different fork or checkpoint.");
    }
  } else {
    console.log("\n⚠️ Could not perform detailed analysis of rpc.ubq.fi/100 - endpoint unreachable.");
  }
}

// Run the main function
if (import.meta.main) {
  main().catch(err => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
