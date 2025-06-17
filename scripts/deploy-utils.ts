/**
 * Deployment Utilities for Deterministic Contract Deployment
 *
 * This file contains utilities for deterministically deploying contracts across
 * multiple chains with automatic verification.
 */

import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  bytesToHex,
  parseEther,
  Hex,
  keccak256,
  Address,
  encodeDeployData,
  PublicClient,
  WalletClient,
  getAddress,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";
import { setTimeout } from "node:timers/promises";

// Interface for chain configuration
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  explorerUrl: string;
  currency: string;
  apiKey?: string;
}

// Standard CREATE2 factory address (same on all EVM chains)
export const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as Address;

// Standard PERMIT2 address (same on all Uniswap compatible chains)
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

// CREATE2 Factory ABI for deployments
export const FACTORY_ABI = [
  {
    inputs: [
      { name: "salt", type: "bytes32" },
      { name: "initCode", type: "bytes" },
    ],
    name: "deploy",
    outputs: [{ name: "deploymentAddress", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "salt", type: "bytes32" },
      { name: "initCodeHash", type: "bytes32" },
    ],
    name: "computeAddress",
    outputs: [{ name: "deploymentAddress", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Compile a Solidity contract
 * @param contractPath Path to the contract file
 * @param filename The contract's filename (for compiler settings)
 * @returns Object containing ABI and bytecode
 */
export function compileContract(contractPath: string, filename: string) {
  console.log(`Compiling contract at ${contractPath}`);
  const source = readFileSync(contractPath, "utf8");

  // Create compiler input
  const input = {
    language: "Solidity",
    sources: {
      [filename]: {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode"],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  // Compile the contract
  const output = JSON.parse(
    solc.compile(JSON.stringify(input))
  );

  // Check for errors
  if (output.errors) {
    const errors = output.errors.filter((error: any) => error.severity === "error");
    if (errors.length > 0) {
      console.error("Compilation errors:");
      errors.forEach((error: any) => console.error(error.formattedMessage));
      throw new Error("Contract compilation failed");
    }

    // Warnings
    const warnings = output.errors.filter((error: any) => error.severity === "warning");
    if (warnings.length > 0) {
      console.warn("Compilation warnings:");
      warnings.forEach((warning: any) => console.warn(warning.formattedMessage));
    }
  }

  // Get the contract name (without extension) for accessing compilation output
  const contractName = filename.replace(".sol", "");

  // Extract ABI and bytecode
  const contractOutput = output.contracts[filename][contractName];

  return {
    abi: contractOutput.abi,
    bytecode: contractOutput.evm.bytecode.object as Hex,
    deployedBytecode: contractOutput.evm.deployedBytecode.object as Hex,
  };
}

/**
 * Calculate the deterministic address using CREATE2
 * @param bytecode Contract bytecode
 * @param constructorArgs Constructor arguments
 * @param saltSuffix Optional suffix to add to the salt (default 4007)
 * @returns The deterministic address
 */
export function getCreate2Address(
  bytecode: Hex,
  constructorArgs: any[] = [],
  saltSuffix = "4007"
): Address {
  // Format the salt with 4007 (default) or custom suffix
  const salt = `0x0000000000000000000000000000000000000000000000000000000000${saltSuffix}`;

  // Encode the full init code (bytecode + constructor args)
  const initCode = encodeDeployData({
    bytecode,
    abi: [], // ABI doesn't matter for encoding bytecode
    args: constructorArgs,
  });

  // Calculate the init code hash
  const initCodeHash = keccak256(initCode);

  // Calculate CREATE2 address according to EIP-1014
  const addressBytes = new Uint8Array([
    0xff, // prefix
    ...hexToBytes(CREATE2_FACTORY.slice(2)), // factory address without 0x
    ...hexToBytes(salt.slice(2)), // salt without 0x
    ...hexToBytes(initCodeHash.slice(2)), // init code hash without 0x
  ]);

  // Hash the concatenated bytes and take last 20 bytes as address
  const addressHash = keccak256(bytesToHex(addressBytes));
  const create2Address = getAddress(`0x${addressHash.slice(26)}`);

  return create2Address;
}

/**
 * Helper to convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Create clients for interacting with the blockchain
 * @param chain Chain configuration
 * @param privateKey Private key for signing transactions
 * @returns Object containing public and wallet clients
 */
async function createClients(chain: ChainConfig, privateKey: string) {
  // Create an account from the private key
  const account = privateKeyToAccount(privateKey as Hex);

  // Try the primary RPC URL first
  let publicClient: PublicClient;
  let walletClient: WalletClient;
  let successfulRpc = chain.rpcUrl;

  // Try all RPC URLs until one works
  const allRpcs = [chain.rpcUrl, ...(chain.fallbackRpcUrls || [])];
  let connected = false;

  for (const rpcUrl of allRpcs) {
    try {
      // Test connection with a basic call
      const transport = http(rpcUrl, {
        timeout: 10000,
        retryCount: 2,
        retryDelay: 1000,
      });

      const testClient = createPublicClient({
        chain: {
          id: chain.chainId,
          name: chain.name,
          rpcUrls: { default: { http: [rpcUrl] } },
        },
        transport,
      });

      // Verify we can connect by getting the chain ID
      const chainId = await testClient.getChainId();
      if (chainId !== chain.chainId) {
        console.warn(`RPC ${rpcUrl} returned incorrect chain ID: ${chainId} (expected ${chain.chainId})`);
        continue;
      }

      // RPC is working, create the real clients
      publicClient = testClient;

      walletClient = createWalletClient({
        account,
        chain: {
          id: chain.chainId,
          name: chain.name,
          rpcUrls: { default: { http: [rpcUrl] } },
        },
        transport,
      });

      console.log(`Connected to ${chain.name} via ${rpcUrl}`);
      connected = true;
      successfulRpc = rpcUrl;
      break;
    } catch (err) {
      console.warn(`Failed to connect to ${rpcUrl}: ${(err as Error).message}`);
    }
  }

  if (!connected) {
    throw new Error(`Failed to connect to any RPC URL for ${chain.name}`);
  }

  return { publicClient, walletClient, successfulRpc };
}

/**
 * Deploy a contract deterministically using CREATE2
 * @param chain Chain configuration
 * @param abi Contract ABI
 * @param bytecode Contract bytecode
 * @param privateKey Private key for signing transactions
 * @param dryRun Whether to perform a dry run (no actual deployment)
 * @returns Deployment result with success status and addresses
 */
export async function deployContract(
  chain: ChainConfig,
  abi: any,
  bytecode: Hex,
  privateKey: string,
  dryRun = false
) {
  console.log(`Preparing to deploy to ${chain.name}${dryRun ? " (DRY RUN)" : ""}`);

  try {
    // Calculate the deterministic address
    const expectedAddress = getCreate2Address(bytecode, [PERMIT2_ADDRESS]);
    console.log(`Expected CREATE2 address: ${expectedAddress}`);

    // If this is a dry run, return early
    if (dryRun) {
      return {
        success: true,
        address: expectedAddress,
        message: "Dry run completed successfully"
      };
    }

    // Check if contract already exists at the address
    const { publicClient, walletClient, successfulRpc } = await createClients(chain, privateKey);

    const code = await publicClient.getBytecode({ address: expectedAddress });

    if (code && code !== "0x") {
      console.log(`Contract already deployed at ${expectedAddress} on ${chain.name}`);
      return {
        success: true,
        address: expectedAddress,
        message: "Contract already deployed"
      };
    }

    // Check if CREATE2 factory exists on this chain
    const factoryCode = await publicClient.getBytecode({ address: CREATE2_FACTORY });
    if (!factoryCode || factoryCode === "0x") {
      throw new Error(`CREATE2 factory not deployed on ${chain.name}`);
    }

    // Get account info
    const account = privateKeyToAccount(privateKey as Hex);

    // Format constructor arguments (only PERMIT2 address in this case)
    const salt = "0x0000000000000000000000004007000000000000000000000000000000000000";

    // Encode the init code (bytecode + constructor args)
    const initCode = encodeDeployData({
      bytecode,
      abi: [], // ABI doesn't matter for encoding bytecode with args
      args: [PERMIT2_ADDRESS],
    });

    // Gas and fee estimation
    let gasLimit;
    let maxFeePerGas;
    let maxPriorityFeePerGas;

    console.log(`Estimating gas for deployment on ${chain.name} via ${successfulRpc}`);

    try {
      // Try to get EIP-1559 fees
      const feeData = await publicClient.estimateFeesPerGas();
      maxFeePerGas = feeData.maxFeePerGas;
      maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

      console.log(`Using EIP-1559 fees:`);
      console.log(`  Max fee: ${formatEther(maxFeePerGas || 0n)} ${chain.currency}`);
      console.log(`  Max priority fee: ${formatEther(maxPriorityFeePerGas || 0n)} ${chain.currency}`);
    } catch (err) {
      // Fall back to legacy gas price
      console.log(`EIP-1559 not supported, using legacy gas price`);
      const gasPrice = await publicClient.getGasPrice();
      maxFeePerGas = gasPrice;
      maxPriorityFeePerGas = undefined;

      console.log(`  Gas price: ${formatEther(gasPrice)} ${chain.currency}`);
    }

    // Get factory contract instance
    const factoryContract = getContract({
      address: CREATE2_FACTORY,
      abi: FACTORY_ABI,
      publicClient,
      walletClient,
    });

    // Estimate gas for deployment
    try {
      gasLimit = await factoryContract.estimateGas.deploy([salt, initCode], {
        account: account.address,
      });

      // Add 20% buffer to gas limit for safety
      gasLimit = (gasLimit * 120n) / 100n;
      console.log(`Estimated gas limit: ${gasLimit.toString()}`);
    } catch (err) {
      console.warn(`Gas estimation failed, using fixed gas limit: ${(err as Error).message}`);
      // Use a fixed gas limit if estimation fails
      gasLimit = 1_000_000n;
    }

    // Deploy the contract using CREATE2 factory
    console.log(`Deploying contract to ${chain.name}...`);

    // Build transaction parameters
    const txParams: any = {
      account: account.address,
      gas: gasLimit,
      value: 0n,
    };

    // Add EIP-1559 or legacy fee parameters
    if (maxPriorityFeePerGas !== undefined) {
      txParams.maxFeePerGas = maxFeePerGas;
      txParams.maxPriorityFeePerGas = maxPriorityFeePerGas;
    } else {
      txParams.gasPrice = maxFeePerGas;
    }

    // Send the transaction
    const txHash = await factoryContract.write.deploy([salt, initCode], txParams);

    console.log(`Transaction sent: ${txHash}`);
    console.log(`Explorer URL: ${chain.explorerUrl}/tx/${txHash}`);

    // Wait for transaction to be mined
    console.log("Waiting for transaction confirmation...");
    let receipt;

    // Try up to 5 times to get the receipt with exponential backoff
    for (let i = 0; i < 5; i++) {
      try {
        receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000, // 60 seconds
        });
        break;
      } catch (err) {
        console.warn(`Attempt ${i + 1}: Failed to get receipt: ${(err as Error).message}`);
        if (i < 4) {
          const delay = Math.pow(2, i) * 1000; // Exponential backoff
          console.log(`Waiting ${delay / 1000} seconds before retry...`);
          await setTimeout(delay);
        } else {
          throw new Error(`Failed to get transaction receipt after ${i + 1} attempts`);
        }
      }
    }

    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    console.log(`Transaction confirmed with status: ${receipt.status}`);

    if (receipt.status === "reverted") {
      throw new Error("Transaction reverted");
    }

    // Verify the contract was actually deployed by checking the bytecode
    const deployedCode = await publicClient.getBytecode({ address: expectedAddress });

    if (!deployedCode || deployedCode === "0x") {
      throw new Error(`Contract not deployed to expected address ${expectedAddress}`);
    }

    console.log(`Contract deployed successfully to ${expectedAddress} on ${chain.name}`);

    return {
      success: true,
      address: expectedAddress,
      txHash,
      message: "Contract deployed successfully",
    };
  } catch (err) {
    console.error(`Deployment failed on ${chain.name}: ${(err as Error).message}`);

    if (err instanceof Error && err.stack) {
      console.error("Stack trace:", err.stack);
    }

    return {
      success: false,
      error: (err as Error).message,
      message: `Deployment failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Verify a contract on the blockchain explorer (Etherscan, Polygonscan, etc.)
 * @param chain Chain configuration
 * @param contractAddress Contract address
 * @param sourceCode Contract source code
 * @param apiKey Explorer API key
 * @returns True if verification was successful, false otherwise
 */
export async function verifyContract(
  chain: ChainConfig,
  contractAddress: Address,
  sourceCode: string,
  apiKey: string
): Promise<boolean> {
  const contractName = "PermitAggregator";
  let apiUrl;

  switch (chain.chainId) {
    case 1: // Ethereum
      apiUrl = "https://api.etherscan.io/api";
      break;
    case 10: // Optimism
      apiUrl = "https://api-optimistic.etherscan.io/api";
      break;
    case 137: // Polygon
      apiUrl = "https://api.polygonscan.com/api";
      break;
    case 100: // Gnosis
      apiUrl = "https://api.gnosisscan.io/api";
      break;
    case 42161: // Arbitrum
      apiUrl = "https://api.arbiscan.io/api";
      break;
    case 8453: // Base
      apiUrl = "https://api.basescan.org/api";
      break;
    default:
      throw new Error(`Verification not supported for chain ID ${chain.chainId}`);
  }

  console.log(`Verifying contract on ${chain.name}...`);

  // Define compiler input for verification
  const compilerInput = {
    language: "Solidity",
    sources: {
      [`PermitAggregator.sol`]: {
        content: sourceCode,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["*"],
        },
      },
    },
  };

  // Define API parameters
  const params = new URLSearchParams();
  params.append("apikey", apiKey);
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("contractaddress", contractAddress);
  params.append("sourceCode", JSON.stringify(compilerInput));
  params.append("codeformat", "solidity-standard-json-input");
  params.append("contractname", `PermitAggregator.sol:${contractName}`);
  params.append("compilerversion", "v0.8.19+commit.7dd6d404"); // Match the solidity version
  params.append("optimizationUsed", "1");
  params.append("runs", "200");
  params.append("constructorArguements", "");
  params.append("licenseType", "3"); // MIT License

  try {
    // Submit verification request
    const response = await axios.post(apiUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

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

      const statusResponse = await axios.get(`${apiUrl}?${statusParams.toString()}`);

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
    return false;
  }
}
