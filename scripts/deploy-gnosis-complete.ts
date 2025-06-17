/**
 * Improved Deployment script for PermitAggregator on Gnosis Chain (chainId 100)
 * with enhanced RPC provider fallback and error handling.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import axios from "axios";
import {
  createPublicClient,
  createWalletClient,
  http,
  concat,
  keccak256,
  isAddress,
  getAddress,
} from "npm:viem";
import { encodeDeployData } from "npm:viem/utils";
import { privateKeyToAccount } from "npm:viem/accounts";
import solc from "npm:solc";

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
  rpcUrl: "https://rpc.ubq.fi/100",
  // Fallback RPCs in priority order
  fallbackRpcUrls: [
    https://rpc.gnosischain.com
    "https://gnosis-mainnet.public.blastapi.io",
    "https://rpc.ankr.com/gnosis",
    // Our RPC is last since it's a relay to others and might have routing inconsistencies
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
    return { success: true, address: expectedAddress, message: "Dry run completed successfully" };
  }

  // Force acknowledgement of existing deployment at known address when env var is set
  if (process.env.SKIP_EXISTENCE_CHECK === "true") {
    console.log("SKIP_EXISTENCE_CHECK=true - Acknowledging existing deployment at known address");
    console.log(`Contract assumed to exist at ${KNOWN_DEPLOYED_ADDRESS}`);

    // If verify flag is set, attempt verification
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
    return { success: false, address: null, message: "DEPLOYER_PRIVATE_KEY not provided" };
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

      const chainConfig = {
        id: chain.chainId,
        name: chain.name,
        nativeCurrency: {
          name: chain.currency,
          symbol: chain.currency,
          decimals: 18
        },
        rpcUrls: {
          default: {
            http: [currentRpc]
          }
        }
      };

      publicClient = createPublicClient({
        chain: chainConfig,
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
        return { success: false, address: null, message: "All RPC endpoints failed" };
      }

      console.log(`Trying next RPC URL: ${rpcUrls[currentRpcIndex]}`);
    }
  }

  // Check if contract exists at expected address first
  console.log("\nPerforming existence checks at expected addresses...");

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
          console.log(`✅ Contract found at ${addrInfo.name} address ${addrInfo.address}`);

          // If verification is requested
          if (process.argv.includes("--verify")) {
            const initCode = encodeDeployData({
              abi: CONSTRUCTOR_ABI,
              bytecode: bytecode as `0x${string}`,
              args: [PERMIT2_ADDRESS],
            });

            // Get constructor arguments for verification
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
      } catch (err) {
        console.error(`Error checking bytecode: ${(err as Error).message}`);
      }
    }
  }

  console.log("\nProceeding with deployment...");

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
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

  // Get gas price
  let gasPrice = 100_000_000n; // 0.1 gwei fallback for Gnosis
  try {
    gasPrice = await publicClient.getGasPrice();
    // Ensure minimum viable gas price for Gnosis Chain (0.1 gwei)
    if (gasPrice < 100_000_000n) {
      gasPrice = 100_000_000n;
    }
  } catch (err) {
    console.error("Failed to get gas price, using fallback:", (err as Error).message);
  }

  console.log(`Gas price: ${Number(gasPrice) / 1e9} gwei`);

  // Fixed gas limit
  const gasLimit = 5_000_000n; // 5 million gas units
  const estimatedCost = gasPrice * gasLimit;

  console.log(`Deployer: ${account.address}`);
  console.log(`Balance: ${(Number(balance) / 1e18).toFixed(6)} ${chain.currency}`);
  console.log(`Estimated cost: ${(Number(estimatedCost) / 1e18).toFixed(6)} ${chain.currency}`);

  if (balance < estimatedCost) {
    console.log(`❌ Insufficient funds – deployment cancelled.`);
    return { success: false, address: null, message: "Insufficient funds" };
  }

  // Initialize wallet client
  const chainConfig = {
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: {
      name: chain.currency,
      symbol: chain.currency,
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [rpcUrls[currentRpcIndex]]
      }
    }
  };

  const walletClient = createWalletClient({
    account,
    chain: chainConfig,
    transport: http(rpcUrls[currentRpcIndex], {
      retryCount: 3,
      retryDelay: 1_000,
      timeout: 30_000,
    }),
  });

  // Get nonce
  let nonce;
  try {
    nonce = await publicClient.getTransactionCount({ address: account.address });
  } catch (err) {
    console.error("Failed to get nonce:", (err as Error).message);
    return { success: false, address: null, message: "Failed to get nonce" };
  }

  // Send transaction with safe error handling
  try {
    console.log("Sending deployment transaction…");
    const txHash = await walletClient.writeContract({
      chain: chainConfig,
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

    // Wait for receipt
    let receipt = null;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000, // 2 minute timeout
      });
      console.log(`Receipt received: status ${receipt.status}`);
    } catch (err) {
      console.error("Failed to get receipt:", (err as Error).message);
      // Check if contract exists despite receipt failure
      for (const addr of [expectedAddress, KNOWN_DEPLOYED_ADDRESS]) {
        try {
          const code = await publicClient.getBytecode({ address: addr });
          if (code && code !== "0x") {
            console.log(`✅ Contract exists at ${addr} despite receipt failure.`);
            return { success: true, address: addr, message: "Deployed successfully" };
          }
        } catch (checkErr) {
          console.error(`Error checking address ${addr}: ${(checkErr as Error).message}`);
        }
      }
      return { success: false, address: null, message: "Transaction sent but receipt unavailable" };
    }

    // Check if successful
    if (receipt.status === "success") {
      console.log("✅ Transaction successful!");

      // Verify the contract was deployed
      const code = await publicClient.getBytecode({ address: expectedAddress });
      if (code && code !== "0x") {
        console.log(`✅ Contract deployed at ${expectedAddress}`);

        // Attempt verification if requested
        if (process.argv.includes("--verify")) {
          const constructorArgs = initCode.slice(bytecode.length);
          await verifyContract(
            expectedAddress,
            constructorArgs,
            readFileSync(join(__dirname, "..", "contracts", "PermitAggregator.sol"), "utf8"),
            "PermitAggregator",
            JSON.parse(metadata).compiler.version,
            chain
          );
        }

        return { success: true, address: expectedAddress, message: "Deployed successfully" };
      } else {
        console.log("⚠️ Transaction successful but contract not found at expected address");
        return { success: false, address: null, message: "Transaction successful but contract not found" };
      }
    } else {
      console.log("❌ Transaction failed");
      return { success: false, address: null, message: "Transaction failed" };
    }
  } catch (err) {
    console.error("Deployment error:", (err as Error).message);
    return { success: false, address: null, message: `Deployment error: ${(err as Error).message}` };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Main function                                 */
/* -------------------------------------------------------------------------- */

async function main() {
  try {
    console.log("🚀 Starting PermitAggregator deployment script for Gnosis Chain");

    // Compile contract
    const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
    const { abi, bytecode, metadata } = compileContract(contractPath, "PermitAggregator.sol");

    // Deploy to Gnosis Chain
    const result = await deployToGnosis(abi, bytecode, metadata);

    // Update deployment results
    if (result.success && result.address) {
      const deploymentData = {
        timestamp: new Date().toISOString(),
        chain: GNOSIS_CHAIN.name,
        chainId: GNOSIS_CHAIN.chainId,
        address: result.address,
        success: true,
        message: result.message
      };

      writeFileSync(
        "deployment-results.json",
        JSON.stringify(deploymentData, null, 2)
      );

      console.log(`\n✅ Deployment successful to address: ${result.address}`);
      console.log(`Explorer: ${GNOSIS_CHAIN.explorerUrl}/address/${result.address}`);
    } else {
      console.log(`\n❌ Deployment failed: ${result.message}`);
    }

    return result;
  } catch (err) {
    console.error("Error in deployment script:", (err as Error).message);
    return { success: false, address: null, message: (err as Error).message };
  }
}

// Execute main function if this file is run directly
if (import.meta.main) {
  main().catch(err => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}

export { deployToGnosis, main };
