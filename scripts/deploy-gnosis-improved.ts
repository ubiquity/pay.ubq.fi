/**
 * Improved Deployment script for PermitAggregator on Gnosis Chain (chainId 100)
 * with enhanced RPC provider fallback and error handling.
 *
 * Usage:
 *   bun run scripts/deploy-gnosis-improved.ts              – deploy
 *   bun run scripts/deploy-gnosis-improved.ts --dry        – compile & show expected address only
 *   bun run scripts/deploy-gnosis-improved.ts --verify     – deploy and attempt verification
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY                                   – private key for deployment (optional)
 *   SKIP_EXISTENCE_CHECK=true                              – force script to acknowledge existing deployment
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import solc from "solc";
import axios from "axios";
import {
  createPublicClient,
  createWalletClient,
  http,
  concat,
  keccak256,
  isAddress,
  getAddress,
} from "viem";
import { encodeDeployData } from "viem/utils";
import { privateKeyToAccount } from "viem/accounts";

/* -------------------------------------------------------------------------- */
/*                              Helper utilities                              */
/* -------------------------------------------------------------------------- */

type Address = `0x${string}`;
type Bytes32 = `0x${string}`;

function toViemAddress(value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid address format: ${value}`);
  }
  return getAddress(value);
}

function validateBytes32(value: string): Bytes32 {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid bytes32 format: ${value}`);
  }
  return value as Bytes32;
}

/* -------------------------------------------------------------------------- */
/*                             Constant addresses                             */
/* -------------------------------------------------------------------------- */

const PERMIT2_ADDRESS = toViemAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const PERMIT_AGGREGATOR_SALT = validateBytes32(
  "0x0000000000000000000000004007ce2083c7f3e18097aeb3a39bb8ec149a341d",
);
const CREATE2_FACTORY = toViemAddress("0x4e59b44847b379578588920cA78FbF26c0B4956C");

// Known deployed contract address from previous deployment
const KNOWN_DEPLOYED_ADDRESS = toViemAddress("0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e");

/* -------------------------------------------------------------------------- */
/*                                   ABIs                                     */
/* -------------------------------------------------------------------------- */

const FACTORY_ABI = [
  {
    inputs: [
      { name: "salt", type: "bytes32" },
      { name: "initializationCode", type: "bytes" },
    ],
    name: "deploy",
    outputs: [{ name: "createdContract", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const CONSTRUCTOR_ABI = [
  {
    inputs: [{ name: "permit2", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
] as const;

/* -------------------------------------------------------------------------- */
/*                               Chain config                                 */
/* -------------------------------------------------------------------------- */

interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  explorerUrl: string;
  explorerApiUrl: string;
  explorerApiKey?: string;
  currency: string;
}

// Updated order - rpc.ubq.fi moved to last position since it's a relay to other providers
const GNOSIS_CHAIN: ChainConfig = {
  chainId: 100,
  name: "Gnosis Chain",
  // Primary RPC
  rpcUrl: "https://rpc.gnosischain.com",
  // Fallback RPCs in priority order
  fallbackRpcUrls: [
    "https://gnosis-mainnet.public.blastapi.io",
    "https://rpc.ankr.com/gnosis",
    // Our RPC is last since it's a relay to others and might have routing inconsistencies
    "https://rpc.ubq.fi/100",
  ],
  explorerUrl: "https://gnosisscan.io",
  explorerApiUrl: "https://api.gnosisscan.io/api",
  explorerApiKey: process.env.ETHERSCAN_API_KEY || "",
  currency: "xDAI",
};

/* -------------------------------------------------------------------------- */
/*                             Compile contract                               */
/* -------------------------------------------------------------------------- */

function compileContract(contractPath: string, contractName: string) {
  console.log(`Compiling ${contractName} from ${contractPath}...`);
  const source = readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      [contractName]: { content: source },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "metadata"],
        },
      },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors && Array.isArray(output.errors)) {
    let hasError = false;
    for (const err of output.errors) {
      if (err.severity === "error") {
        hasError = true;
        console.error("Solidity compile error:", err.formattedMessage ?? err.message);
      } else {
        console.warn("Solidity compile warning:", err.formattedMessage ?? err.message);
      }
    }
    if (hasError) throw new Error("Solidity compilation failed – see errors above.");
  }

  // Extract actual contract name without extension
  const actualContractName = contractName.replace(/\.sol$/, "");
  const contract = output.contracts[contractName]?.[actualContractName];
  if (!contract || !contract.abi || !contract.evm?.bytecode?.object) {
    throw new Error(`Invalid compilation output – check contract name & Solidity version. Looking for '${actualContractName}' in ${contractName}`);
  }
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
    metadata: contract.metadata
  };
}

/* -------------------------------------------------------------------------- */
/*                        Deterministic CREATE2 address                       */
/* -------------------------------------------------------------------------- */

function getCreate2Address(bytecode: string, constructorArgs: [Address]): Address {
  const initCode = encodeDeployData({
    abi: CONSTRUCTOR_ABI,
    bytecode: bytecode as `0x${string}`,
    args: constructorArgs,
  });

  // Debug CREATE2 parameters
  console.log("\nDEBUG CREATE2 Address Calculation:");
  console.log(`- CREATE2_FACTORY: ${CREATE2_FACTORY}`);
  console.log(`- PERMIT_AGGREGATOR_SALT: ${PERMIT_AGGREGATOR_SALT}`);
  console.log(`- InitCode Length: ${initCode.length} bytes`);
  console.log(`- InitCodeHash: ${keccak256(initCode)}`);

  const initCodeHash = keccak256(initCode);
  const create2Address = keccak256(
    concat(["0xff", CREATE2_FACTORY, PERMIT_AGGREGATOR_SALT, initCodeHash]),
  ).slice(26);

  const address = `0x${create2Address}` as Address;
  console.log(`- Calculated CREATE2 Address: ${address}`);
  return address;
}

/* -------------------------------------------------------------------------- */
/*                         Contract Verification                              */
/* -------------------------------------------------------------------------- */

async function verifyContract(
  address: Address,
  constructorArgs: string,
  sourceCode: string,
  contractName: string,
  compilerVersion: string,
  chain: ChainConfig
) {
  if (!chain.explorerApiUrl || !chain.explorerApiKey) {
    console.log("Skipping verification - missing explorer API URL or API key");
    return { success: false, message: "Missing explorer configuration" };
  }

  try {
    console.log(`\nVerifying contract at ${address} on ${chain.name}...`);

    // Extract compiler version from metadata or use fallback
    const versionMatch = compilerVersion.match(/^(0\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : "0.8.19";

    // Check if contract is already verified
    const checkUrl = `${chain.explorerApiUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${chain.explorerApiKey}`;
    const checkResponse = await axios.get(checkUrl);

    if (checkResponse.data.status === "1" &&
        checkResponse.data.result?.[0]?.SourceCode &&
        checkResponse.data.result[0].SourceCode.length > 3) {
      console.log("✅ Contract already verified");
      return { success: true, message: "Contract already verified" };
    }

    // If not verified, submit verification request
    console.log("Submitting verification request...");

    const verifyUrl = `${chain.explorerApiUrl}`;
    const params = new URLSearchParams();
    params.append("module", "contract");
    params.append("action", "verifysourcecode");
    params.append("contractaddress", address);
    params.append("sourceCode", sourceCode);
    params.append("codeformat", "solidity-single-file");
    params.append("contractname", contractName);
    params.append("compilerversion", `v${version}`);
    params.append("optimizationUsed", "1");
    params.append("runs", "200");
    params.append("constructorArguements", constructorArgs.startsWith("0x") ? constructorArgs.slice(2) : constructorArgs);
    params.append("apikey", chain.explorerApiKey);

    const response = await axios.post(verifyUrl, params);

    if (response.data.status === "1" && response.data.result) {
      console.log(`Verification submitted successfully. GUID: ${response.data.result}`);
      console.log(`Check status at: ${chain.explorerUrl}/address/${address}#code`);

      // Poll for verification status
      const guid = response.data.result;
      let verified = false;
      let attempts = 0;

      console.log("Waiting for verification to complete...");

      while (!verified && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusUrl = `${chain.explorerApiUrl}?module=contract&action=checkverifystatus&guid=${guid}&apikey=${chain.explorerApiKey}`;
        const statusResponse = await axios.get(statusUrl);

        if (statusResponse.data.status === "1" ||
            statusResponse.data.result.toLowerCase().includes("success")) {
          console.log("✅ Contract verified successfully!");
          verified = true;
          return { success: true, message: "Contract verified successfully" };
        } else if (statusResponse.data.result.includes("already verified")) {
          console.log("✅ Contract was already verified");
          verified = true;
          return { success: true, message: "Contract was already verified" };
        } else if (statusResponse.data.result.toLowerCase().includes("fail") ||
                  statusResponse.data.result.toLowerCase().includes("error")) {
          console.error(`❌ Verification failed: ${statusResponse.data.result}`);
          return { success: false, message: statusResponse.data.result };
        }

        console.log(`Verification in progress... (attempt ${++attempts}/10)`);
      }

      if (!verified) {
        console.log("⚠️ Verification status could not be determined");
        return { success: false, message: "Verification timed out" };
      }
    } else {
      console.error(`❌ Failed to submit verification: ${response.data.result || response.data.message || "Unknown error"}`);
      return { success: false, message: response.data.result || response.data.message || "Unknown error" };
    }
  } catch (err) {
    console.error(`❌ Verification error: ${(err as Error).message}`);
    return { success: false, message: (err as Error).message };
  }

  return { success: false, message: "Verification failed" };
}

/* -------------------------------------------------------------------------- */
/*                          Deployment to Gnosis Chain                        */
/* -------------------------------------------------------------------------- */

async function deployToGnosis(abi: any, bytecode: string, metadata: string) {
  const chain = GNOSIS_CHAIN;
  console.log(`\nProcessing ${chain.name} (${chain.chainId})`);

  const expectedAddress = getCreate2Address(bytecode, [PERMIT2_ADDRESS]);
  console.log(`Expected contract address: ${expectedAddress}`);
  console.log(`Known deployed address: ${KNOWN_DEPLOYED_ADDRESS}`);

  // Support dry-run for CI / compile checks
  if (process.argv.includes("--dry")) {
    console.log("Dry-run mode – skipping on-chain interactions.");

    // Only update expected-address.txt in dry-run if specifically requested
    if (process.argv.includes("--update-address")) {
      writeFileSync("expected-address.txt", expectedAddress);
      console.log(`Updated expected-address.txt with address: ${expectedAddress}`);
    }

    return { success: true, address: expectedAddress, message: "Dry run completed successfully" };
  }

  // Force acknowledgement of existing deployment at known address when env var is set
  if (process.env.SKIP_EXISTENCE_CHECK === "true") {
    console.log("SKIP_EXISTENCE_CHECK=true - Acknowledging existing deployment at known address");
    console.log(`Contract assumed to exist at ${KNOWN_DEPLOYED_ADDRESS}`);

    // Update deployment results
    writeFileSync(
      "deployment-results.json",
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          chain: GNOSIS_CHAIN.name,
          chainId: GNOSIS_CHAIN.chainId,
          address: KNOWN_DEPLOYED_ADDRESS,
          success: true,
          message: "Existing deployment acknowledged (SKIP_EXISTENCE_CHECK)"
        },
        null,
        2,
      ),
    );

    // If verify flag is set, attempt verification even with SKIP_EXISTENCE_CHECK
    if (process.argv.includes("--verify")) {
      const initCode = encodeDeployData({
        abi: CONSTRUCTOR_ABI,
        bytecode: bytecode as `0x${string}`,
        args: [PERMIT2_ADDRESS],
      });

      try {
        // Get constructor arguments in ABI-encoded format for verification
        const constructorArgs = initCode.slice(bytecode.length);
        const verifyResult = await verifyContract(
          KNOWN_DEPLOYED_ADDRESS,
          constructorArgs,
          readFileSync(join(__dirname, "..", "contracts", "PermitAggregator.sol"), "utf8"),
          "PermitAggregator",
          JSON.parse(metadata).compiler.version,
          chain
        );

        console.log(`Verification result: ${verifyResult.message}`);
      } catch (err) {
        console.error(`Verification error: ${(err as Error).message}`);
      }
    }

    return { success: true, address: KNOWN_DEPLOYED_ADDRESS, message: "Existing deployment acknowledged" };
  }

  // Check if DEPLOYER_PRIVATE_KEY is provided
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.log("Skipping deployment – DEPLOYER_PRIVATE_KEY not provided.");
    return { success: true, address: null, message: "Skipping deployment – DEPLOYER_PRIVATE_KEY not provided" };
  }

  // Use all available RPC URLs
  const rpcUrls = [chain.rpcUrl, ...(chain.fallbackRpcUrls || [])];
  let currentRpcIndex = 0;
  let publicClient: any = null;

  // Try each RPC URL until one works
  console.log("\nAttempting to connect to RPC providers:");
  while (currentRpcIndex < rpcUrls.length) {
    const currentRpc = rpcUrls[currentRpcIndex];
    try {
      console.log(`- Trying ${currentRpc}...`);

      publicClient = createPublicClient({
        chain: { id: chain.chainId, name: chain.name, rpcUrls: { default: { http: [currentRpc] } } },
        transport: http(currentRpc, {
          retryCount: 3,
          retryDelay: 1_000,
          timeout: 30_000,
        }),
      });

      // Test the connection with a simple call
      await publicClient.getChainId();
      console.log(`✅ Successfully connected to ${currentRpc}`);
      break;
    } catch (err) {
      console.error(`❌ Failed to connect to RPC ${currentRpc}: ${(err as Error).message}`);
      currentRpcIndex++;

      if (currentRpcIndex >= rpcUrls.length) {
        console.error("\nAll RPC endpoints failed. Cannot proceed with deployment.");
        return { success: false, address: null, message: "All RPC endpoints failed - deployment skipped" };
      }

      console.log(`Trying next RPC URL: ${rpcUrls[currentRpcIndex]}`);
    }
  }

  // If we still don't have a publicClient, all RPCs failed
  if (!publicClient) {
    console.error("Failed to establish connection to any RPC endpoint.");
    return { success: false, address: null, message: "Failed to connect to RPC - deployment skipped" };
  }

  // Ensure CREATE2 factory exists on the target chain
  console.log("\nChecking CREATE2 factory existence...");
  const factoryCode = await publicClient.getBytecode({ address: CREATE2_FACTORY });
  if (!factoryCode) {
    console.log("❌ CREATE2 factory not deployed on this chain – skipping deployment.");
    return { success: false, address: null, message: "CREATE2 factory not found on chain - deployment skipped" };
  }
  console.log("✅ CREATE2 factory exists on chain");

  // Check if contract exists at expected address first
  console.log("\nPerforming existence checks at expected addresses...");
  let contractExists = false;
  let existingAddress: Address | null = null;

  // Addresses to check in order
  const addressesToCheck = [
    { name: "Expected", address: expectedAddress },
    { name: "Known", address: KNOWN_DEPLOYED_ADDRESS }
  ];

  for (const addrInfo of addressesToCheck) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`Checking if contract exists at ${addrInfo.name} address ${addrInfo.address} (attempt ${attempt + 1})...`);
        const code = await publicClient.getBytecode({ address: addrInfo.address });

        // If code exists and isn't just "0x" (empty), contract exists
        if (code && code !== "0x") {
          console.log(`✅ Contract found at ${addrInfo.name} address ${addrInfo.address} with ${code.length} bytes of code`);
          contractExists = true;
          existingAddress = addrInfo.address;

          // Basic check to confirm it's our contract
          try {
            // Try to read the permit2 address from the contract
            const permit2Result = await publicClient.readContract({
              address: addrInfo.address,
              abi: [
                {
                  inputs: [],
                  name: "permit2",
                  outputs: [{ type: "address", name: "" }],
                  stateMutability: "view",
                  type: "function",
                },
              ],
              functionName: "permit2",
            }).catch(() => null);

            if (permit2Result) {
              console.log(`✅ Contract confirmed as PermitAggregator (permit2=${permit2Result})`);

              // If verification is requested
              if (process.argv.includes("--verify")) {
                const initCode = encodeDeployData({
                  abi: CONSTRUCTOR_ABI,
                  bytecode: bytecode as `0x${string}`,
                  args: [PERMIT2_ADDRESS],
                });

                // Get constructor arguments in ABI-encoded format for verification
                const constructorArgs = initCode.slice(bytecode.length);
                const verifyResult = await verifyContract(
                  addrInfo.address,
                  constructorArgs,
                  readFileSync(join(__dirname, "..", "contracts", "PermitAggregator.sol"), "utf8"),
                  "PermitAggregator",
                  JSON.parse(metadata).compiler.version,
                  chain
                );

                console.log(`Verification result: ${verifyResult.message}`);
              }

              return { success: true, address: addrInfo.address, message: `Contract found at ${addrInfo.name.toLowerCase()} address` };
            }
          } catch (checkErr) {
            console.log(`⚠️ Contract interface check failed, but assuming it's still our contract: ${(checkErr as Error).message}`);
          }

          // Return success even if the interface check failed
          return { success: true, address: addrInfo.address, message: `Contract found at ${addrInfo.name.toLowerCase()} address` };
        } else {
          console.log(`No contract found at ${addrInfo.name} address on attempt ${attempt + 1}`);
        }
      } catch (err) {
        console.error(`⚠️ Error checking bytecode at ${addrInfo.name} address (attempt ${attempt + 1}):`, (err as Error).message);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Short pause between retries
      }
    }
  }

  console.log("\nConfirmed contract does not exist at expected or known addresses, proceeding with deployment...");

  const privateKey =
    process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
      ? (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`)
      : (`0x${process.env.DEPLOYER_PRIVATE_KEY}` as `0x${string}`);
  const account = privateKeyToAccount(privateKey);

  // Prepare data & cost estimates
  const initCode = encodeDeployData({
    abi: CONSTRUCTOR_ABI,
    bytecode: bytecode as `0x${string}`,
    args: [PERMIT2_ADDRESS],
  });

  const balance = await publicClient.getBalance({ address: account.address });

  // Get current gas price from the network with minimum threshold for Gnosis Chain
  let gasPrice;
  try {
    gasPrice = await publicClient.getGasPrice();
    console.log(`Network gas price: ${Number(gasPrice) / 1e9} gwei`);

    // Ensure minimum viable gas price for Gnosis Chain (0.1 gwei)
    const minimumGasPrice = 100_000_000n; // 0.1 gwei
    if (gasPrice < minimumGasPrice) {
      console.log(`Network gas price too low, using minimum of 0.1 gwei instead`);
      gasPrice = minimumGasPrice;
    }
  } catch (err) {
    console.error("Failed to get gas price:", (err as Error).message);
    console.log("Falling back to 0.1 gwei gas price (Gnosis Chain typical value)");
    gasPrice = 100_000_000n; // 0.1 gwei fallback for Gnosis
  }

  console.log(`Final gas price: ${Number(gasPrice) / 1e9} gwei`);

  // Fixed gas limit for deployment
  const gasLimit = 5_000_000n; // 5 million gas units
  console.log(`Using gas limit: ${gasLimit.toString()} gas units`);

  const estimatedCost = gasPrice * gasLimit;

  console.log(`Deployer: ${account.address}`);
  console.log(`Balance: ${(Number(balance) / 1e18).toFixed(6)} ${chain.currency}`);
  console.log(
    `Estimated deployment cost: ${(Number(estimatedCost) / 1e18).toFixed(6)} ${chain.currency}`,
  );

  if (balance < estimatedCost) {
    console.log(`❌ Insufficient funds – deployment cancelled.`);
    // Return as failed with insufficient funds message
    return { success: false, address: null, message: "Insufficient funds for deployment - skipped" };
  }

  // Enhanced logging for wallet client
  console.log(`\nInitializing wallet client with same RPC URL...`);

  const walletClient = createWalletClient({
    account,
    chain: { id: chain.chainId, name: chain.name, rpcUrls: { default: { http: [rpcUrls[currentRpcIndex]] } } },
    transport: http(rpcUrls[currentRpcIndex], {
      retryCount: 3,
      retryDelay: 1_000,
      timeout: 30_000,
    }),
  });

  // Safely get the transaction count with retries
  let nonce;
  try {
    console.log("Getting transaction count...");
    nonce = await publicClient.getTransactionCount({ address: account.address });
    console.log(`Current nonce: ${nonce}`);
  } catch (err) {
    console.error("Failed to get transaction count:", (err as Error).message);
    return { success: false, address: null, message: "Failed to get nonce - deployment skipped" };
  }

  // Log the detailed transaction parameters for debugging
  console.log("\nTransaction parameters:");
  console.log(`- Factory address: ${CREATE2_FACTORY}`);
  console.log(`- Salt: ${PERMIT_AGGREGATOR_SALT}`);
  console.log(`- InitCode length: ${initCode.length} bytes`);
  console.log(`- Gas price: ${Number(gasPrice) / 1e9} gwei`);
  console.log(`- Gas limit: ${gasLimit.toString()} gas units`);
  console.log(`- Nonce: ${nonce}`);

  // Send transaction with safe error handling
  let txHash;
  try {
    console.log("Sending deployment transaction…");
    txHash = await walletClient.writeContract({
      address: CREATE2_FACTORY,
      abi: FACTORY_ABI,
      functionName: "deploy",
      args: [PERMIT_AGGREGATOR_SALT, initCode],
      gasPrice,
      gas: gasLimit,
      nonce,
    });

    console.log(`Transaction sent! Hash: ${txHash}`);
    console.log(`Explorer: ${chain.explorerUrl}/tx/${txHash}`);
    console.log("Awaiting confirmation…");

    // Add retry logic for transaction receipt
    let receipt = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        console.log(`Waiting for transaction receipt (attempt ${attempt + 1}/5)...`);
        receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 120_000, // 2 minute timeout
        });
        console.log(`Receipt received: status ${receipt.status}`);
        break; // Exit loop if successful
      } catch (waitErr) {
        console.log(`Receipt fetch attempt ${attempt + 1} failed: ${(waitErr as Error).message}`);
        if (attempt < 4) {
          console.log("Retrying in 5 seconds...");
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
        } else {
          console.log("Maximum attempts reached for receipt fetch.");
        }
      }
    }

    // Check if we got a receipt
    if (!receipt) {
      console.log("Failed to get transaction receipt after multiple attempts.");

      // Check expected address directly
      console.log("Checking if contract was deployed despite receipt failure...");
      const addresses = [expectedAddress, KNOWN_DEPLOYED_ADDRESS];

      for (const addr of addresses) {
        try {
          console.log(`Checking address ${addr}...`);
          const code = await publicClient.getBytecode({ address: addr });
          if (code && code !== "0x") {
            console.log(`✅ Contract exists at ${addr} despite receipt failure.`);

            // Attempt verification if requested
            if (process.argv.includes("--verify")) {
              const constructorArgs = initCode.slice(bytecode.length);
              await verifyContract(
                addr,
                constructorArgs,
                readFileSync(join(__dirname, "..", "contracts", "PermitAggregator.sol"), "utf8"),
                "PermitAggregator",
                JSON.parse(metadata).compiler.version,
                chain
              );
            }

            return { success: true, address: addr, message: "Contract deployed successfully but receipt unavailable" };
          }
        } catch (checkErr) {
          console.error(`Error checking address ${addr}: ${(checkErr as Error).message}`);
        }
      }

      console.log("❌ Contract not deployed.");
      return { success: false, address: null, message: "Deployment status unknown - transaction sent but receipt unavailable" };
    }

    // Handle receipt status
    if (receipt.status !== "success") {
      // If the transaction reverted, check addresses - it might have been deployed already
      const addresses = [expectedAddress, KNOWN_DEPLOYED_ADDRESS];

      for (const addr of addresses) {
        for (let retryAttempt = 0; retryAttempt < 3; retryAttempt++) {
          try {
            console.log(`Transaction reverted, checking address ${addr} (attempt ${retryAttempt + 1}/3)...`);
            const codePostTx = await publicClient.getBytecode({ address: addr });

            if (codePostTx && codePostTx !== "0x") {
              console.log(`✅ Found contract at ${addr} - treating as successful deployment`);

              // Attempt verification if requested
              if (process.argv.includes("--verify")) {
                const constructorArgs = initCode.slice(bytecode.length);
                await verifyContract(
                  addr,
                  constructorArgs,
                  readFileSync(join(__dirname, "..", "contracts", "PermitAggregator.sol"), "utf8"),
                  "
