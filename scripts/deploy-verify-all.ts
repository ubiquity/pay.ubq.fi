/**
 * Multi-Chain Deterministic Deployment Script
 *
 * This script enables deterministic deployment of the PermitAggregator contract
 * to multiple chains in a single command, with automatic verification.
 *
 * Usage:
 *   bun run scripts/deploy-verify-all.ts                      - deploy to all chains
 *   bun run scripts/deploy-verify-all.ts --chains=1,137,100   - deploy to specific chains (by chainId)
 *   bun run scripts/deploy-verify-all.ts --dry                - compile and show addresses only
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY                - Required for actual deployments
 *   ETHERSCAN_API_KEY                   - Required for verification
 *   CHAIN_SPECIFIC_API_KEYS             - Optional JSON of chain-specific API keys
 *                                        Format: {"1":"etherscankey","137":"polygonscankey"}
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import {
  compileContract,
  getCreate2Address,
  deployContract,
  verifyContract,
  PERMIT2_ADDRESS,
  type ChainConfig
} from "./deploy-utils.ts";

// Define all supported chains with reliable RPCs
const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    fallbackRpcUrls: [
      "https://rpc.ankr.com/eth",
      "https://ethereum.publicnode.com"
    ],
    explorerUrl: "https://etherscan.io",
    currency: "ETH",
  },

  // Optimism
  10: {
    chainId: 10,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    fallbackRpcUrls: [
      "https://optimism.llamarpc.com",
      "https://rpc.ankr.com/optimism"
    ],
    explorerUrl: "https://optimistic.etherscan.io",
    currency: "ETH",
  },

  // Polygon
  137: {
    chainId: 137,
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    fallbackRpcUrls: [
      "https://polygon.llamarpc.com",
      "https://rpc.ankr.com/polygon"
    ],
    explorerUrl: "https://polygonscan.com",
    currency: "MATIC",
  },

  // Gnosis Chain
  100: {
    chainId: 100,
    name: "Gnosis Chain",
    rpcUrl: "https://rpc.gnosischain.com",
    fallbackRpcUrls: [
      "https://gnosis-mainnet.public.blastapi.io",
      "https://rpc.ankr.com/gnosis",
      // Ubiquity RPC last due to reported issues
      "https://rpc.ubq.fi/100"
    ],
    explorerUrl: "https://gnosisscan.io",
    currency: "xDAI",
  },

  // Arbitrum One
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    fallbackRpcUrls: [
      "https://arbitrum.llamarpc.com",
      "https://rpc.ankr.com/arbitrum"
    ],
    explorerUrl: "https://arbiscan.io",
    currency: "ETH",
  },

  // Base
  8453: {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    fallbackRpcUrls: [
      "https://base.llamarpc.com",
      "https://rpc.ankr.com/base"
    ],
    explorerUrl: "https://basescan.org",
    currency: "ETH",
  },
};

// Parse command line arguments
function parseArgs() {
  const isDryRun = process.argv.includes("--dry");

  // Parse chain IDs to deploy to
  const chainsArg = process.argv.find(arg => arg.startsWith("--chains="));
  let chainIds: number[] = Object.keys(SUPPORTED_CHAINS).map(Number);

  if (chainsArg) {
    try {
      const chainsStr = chainsArg.split("=")[1];
      chainIds = chainsStr.split(",").map(s => parseInt(s.trim(), 10));

      // Validate chain IDs
      const invalidChains = chainIds.filter(id => !SUPPORTED_CHAINS[id]);
      if (invalidChains.length > 0) {
        console.error(`Error: Unsupported chain IDs: ${invalidChains.join(", ")}`);
        console.error(`Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error parsing --chains argument: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  return {
    isDryRun,
    chainIds
  };
}

// Load chain specific API keys from environment variable if available
function loadChainApiKeys(): Record<number, string> {
  if (!process.env.CHAIN_SPECIFIC_API_KEYS) {
    return {};
  }

  try {
    return JSON.parse(process.env.CHAIN_SPECIFIC_API_KEYS);
  } catch (err) {
    console.warn(`Warning: Failed to parse CHAIN_SPECIFIC_API_KEYS: ${(err as Error).message}`);
    return {};
  }
}

async function main() {
  console.log("Multi-Chain Deterministic Deployment");
  console.log("===================================");

  const { isDryRun, chainIds } = parseArgs();
  const chainApiKeys = loadChainApiKeys();

  if (isDryRun) {
    console.log("Dry-run mode – only compiling and calculating deterministic addresses.");
  } else {
    console.log("Deployment mode – will attempt to deploy to all specified chains.");

    // Check for private key
    if (!process.env.DEPLOYER_PRIVATE_KEY) {
      console.error("Error: DEPLOYER_PRIVATE_KEY environment variable is required for deployment.");
      process.exit(1);
    }
  }

  console.log(`Target chains: ${chainIds.map(id => SUPPORTED_CHAINS[id].name).join(", ")}`);

  // Compile contract first
  console.log("\nCompiling contract...");
  const CONTRACT_PATH = join(__dirname, "..", "contracts", "PermitAggregator.sol");

  try {
    // Check if contract file exists
    try {
      if (!readFileSync(CONTRACT_PATH, "utf8")) {
        throw new Error("Contract file not found or empty");
      }
      console.log(`Contract file found at ${CONTRACT_PATH}`);
    } catch (err) {
      console.error(`Failed to read contract file: ${(err as Error).message}`);
      throw err;
    }

    // Compile the contract
    const { abi, bytecode } = compileContract(CONTRACT_PATH, "PermitAggregator.sol");

    // Basic validation of bytecode
    if (!bytecode || bytecode.length < 10) {
      throw new Error(`Invalid bytecode generated: ${bytecode}`);
    }
    console.log(`Bytecode compiled successfully (${bytecode.length} characters)`);

    // Calculate deterministic address (same across all chains)
    const expectedAddress = getCreate2Address(bytecode, [PERMIT2_ADDRESS]);
    console.log(`\nExpected deterministic address on all chains: ${expectedAddress}`);

    // Create results directory if it doesn't exist
    const resultsDir = join(__dirname, "..", "deployment-results");
    if (!existsSync(resultsDir)) {
      const fs = require('fs');
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Store the expected address for reference
    writeFileSync(join(resultsDir, "expected-address.txt"), expectedAddress);

    // If dry run, exit here
    if (isDryRun) {
      console.log(`\nDry run completed successfully for all chains.`);
      return { status: "success" };
    }

    // Deploy to each chain in sequence
    const deploymentResults: Record<number, any> = {};

    for (const chainId of chainIds) {
      console.log(`\n---------------------------------------------------------`);
      console.log(`DEPLOYING TO ${SUPPORTED_CHAINS[chainId].name.toUpperCase()}`);
      console.log(`---------------------------------------------------------`);

      try {
        // Get chain-specific API key if available
        const apiKey = chainApiKeys[chainId] || process.env.ETHERSCAN_API_KEY;
        const chain = { ...SUPPORTED_CHAINS[chainId], apiKey };

        // Deploy contract
        const result = await deployContract(
          chain,
          abi,
          bytecode,
          process.env.DEPLOYER_PRIVATE_KEY,
          false // not a dry run
        );

        deploymentResults[chainId] = {
          chainId,
          chainName: chain.name,
          timestamp: new Date().toISOString(),
          success: result.success,
          address: result.address,
          txHash: result.txHash || null,
          message: result.message
        };

        console.log(`Deployment to ${chain.name} ${result.success ? 'succeeded' : 'failed'}`);

        // Verify contract if deployment was successful
        if (result.success && result.address && apiKey) {
          console.log(`\nAttempting contract verification on ${chain.name}...`);
          const sourceCode = readFileSync(CONTRACT_PATH, "utf8");

          try {
            const verificationResult = await verifyContract(
              chain,
              result.address,
              sourceCode,
              apiKey
            );

            deploymentResults[chainId].verified = verificationResult;

            if (verificationResult) {
              console.log(`Contract verification on ${chain.name} was successful!`);
            } else {
              console.log(`Contract verification on ${chain.name} failed or is pending.`);
            }
          } catch (verifyErr) {
            console.error(`Verification error: ${(verifyErr as Error).message}`);
            deploymentResults[chainId].verified = false;
            deploymentResults[chainId].verificationError = (verifyErr as Error).message;
          }
        } else if (result.success && result.address) {
          console.log(`Skipping verification - No API key provided for ${chain.name}`);
          deploymentResults[chainId].verified = false;
        }
      } catch (chainErr) {
        console.error(`Error processing ${SUPPORTED_CHAINS[chainId].name}: ${(chainErr as Error).message}`);
        deploymentResults[chainId] = {
          chainId,
          chainName: SUPPORTED_CHAINS[chainId].name,
          timestamp: new Date().toISOString(),
          success: false,
          error: (chainErr as Error).message
        };
      }
    }

    // Save comprehensive results to file
    const resultsPath = join(resultsDir, `deployment-${Date.now()}.json`);
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          expectedAddress,
          results: deploymentResults
        },
        null,
        2
      )
    );

    console.log(`\n---------------------------------------------------------`);
    console.log(`DEPLOYMENT SUMMARY`);
    console.log(`---------------------------------------------------------`);

    // Generate summary
    const successful = Object.values(deploymentResults).filter(r => r.success).length;
    const total = chainIds.length;

    console.log(`Successful deployments: ${successful}/${total} chains`);
    console.log(`Expected address: ${expectedAddress}`);
    console.log(`Detailed results saved to: ${resultsPath}`);

    for (const chainId of chainIds) {
      const result = deploymentResults[chainId];
      const statusSymbol = result.success ? '✅' : '❌';
      const verificationSymbol = result.success ? (result.verified ? '✅' : '⚠️') : '-';

      console.log(`${statusSymbol} ${result.chainName} - Deploy: ${result.success ? 'Success' : 'Failed'}, Verify: ${verificationSymbol}`);

      if (result.success && result.address) {
        console.log(`   Address: ${result.address}`);
        console.log(`   Explorer: ${SUPPORTED_CHAINS[chainId].explorerUrl}/address/${result.address}`);
      }
    }

    return {
      status: "success",
      successful,
      total
    };
  } catch (err) {
    console.error("\nError in main:", err instanceof Error ? err.message : String(err));

    if (err instanceof Error && err.stack) {
      console.error("\nStack trace:", err.stack);
    }

    return {
      status: "failure",
      error: String(err)
    };
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
