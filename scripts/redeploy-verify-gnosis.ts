/**
 * Redeploy PermitAggregator Contract on Gnosis Chain
 *
 * This script deploys the PermitAggregator contract on Gnosis Chain and
 * immediately attempts to verify it using the Gnosisscan API.
 *
 * Usage:
 *   bun run scripts/redeploy-verify-gnosis.ts
 *
 * Requirements:
 *   - DEPLOYER_PRIVATE_KEY environment variable containing the deployer wallet's private key
 */

import { createWalletClient, http, createPublicClient, parseEther, getCreate2Address, keccak256, concat, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import axios from "axios";
import { setTimeout } from "node:timers/promises";

// Permit2 address on all chains
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Gnosisscan API key for verification
const GNOSISSCAN_API_KEY = "89SNHUCI1TAXG7HWUNW9Z1ZYXT93G22HHQ";

// Gnosis Chain RPC URL
const RPC_URL = "https://rpc.gnosischain.com";

// Configure Gnosis Chain
const chain = {
  ...gnosis,
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
    public: {
      http: [RPC_URL],
    },
  },
};

/**
 * Deploy the PermitAggregator contract on Gnosis Chain
 */
async function deployContract() {
  // Read private key from environment variable
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY environment variable is required");
  }

  // Create account from private key
  const account = privateKeyToAccount(`0x${privateKey}`);
  console.log(`Using account: ${account.address}`);

  // Read contract source code
  const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
  const sourceCode = readFileSync(contractPath, "utf8");
  console.log(`Contract source code loaded from ${contractPath}`);

  // Compile contract using solc (this is a simplification; in practice, use a build system)
  console.log("Compiling contract...");
  const { exec } = await import("child_process");
  const solcVersion = "0.8.20";

  // Create temporary files for compilation
  const tempDir = join(__dirname, "temp");
  const tempContractPath = join(tempDir, "PermitAggregator.sol");
  const tempOutputPath = join(tempDir, "output.json");

  try {
    // Ensure temp directory exists
    try {
      require("node:fs").mkdirSync(tempDir, { recursive: true });
    } catch (err) {
      throw new Error(`Failed to create temp directory: ${err}`);
    }

    // Write contract to temp file
    writeFileSync(tempContractPath, sourceCode);

    // Compile using solc
    const solcCommand = `npx solc@${solcVersion} --optimize --optimize-runs 200 --standard-json > ${tempOutputPath} << EOL
    {
      "language": "Solidity",
      "sources": {
        "PermitAggregator.sol": {
          "content": ${JSON.stringify(sourceCode)}
        }
      },
      "settings": {
        "optimizer": {
          "enabled": true,
          "runs": 200
        },
        "outputSelection": {
          "*": {
            "*": ["abi", "evm.bytecode", "evm.deployedBytecode"]
          }
        }
      }
    }
EOL`;

    await new Promise((resolve, reject) => {
      exec(solcCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Compilation error: ${error.message}`);
          return reject(error);
        }
        if (stderr) {
          console.error(`Compilation stderr: ${stderr}`);
        }
        resolve(stdout);
      });
    });

    // Read compiled output
    const compiledOutput = JSON.parse(readFileSync(tempOutputPath, "utf8"));

    if (compiledOutput.errors) {
      const hasError = compiledOutput.errors.some((err: any) => err.severity === "error");
      if (hasError) {
        throw new Error("Compilation failed: " + JSON.stringify(compiledOutput.errors));
      } else {
        console.warn("Compilation warnings:", JSON.stringify(compiledOutput.errors));
      }
    }

    const contractOutput = compiledOutput.contracts["PermitAggregator.sol"].PermitAggregator;
    const abi = contractOutput.abi;
    const bytecode = contractOutput.evm.bytecode.object;

    console.log("Contract compiled successfully");

    // Create wallet client
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Get nonce
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
    });

    // No need to predict the contract address since we'll get it from the transaction receipt

    // Deploy contract
    console.log(`Deploying PermitAggregator to Gnosis Chain...`);

    // Constructor argument: PERMIT2 address
    const constructorArgs = PERMIT2_ADDRESS.startsWith('0x')
      ? PERMIT2_ADDRESS.slice(2)
      : PERMIT2_ADDRESS;

    // Deploy transaction
    const deployHash = await walletClient.deployContract({
      abi,
      bytecode: `0x${bytecode}`,
      args: [PERMIT2_ADDRESS],
      account,
    });

    console.log(`Deployment transaction sent with hash: ${deployHash}`);
    console.log(`Waiting for transaction to be mined...`);

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

    console.log(`Contract deployed at: ${receipt.contractAddress}`);
    console.log(`Gas used: ${receipt.gasUsed}`);

    // Store deployment info
    const deploymentInfo = {
      chain: "gnosis",
      contractAddress: receipt.contractAddress,
      deploymentTxHash: deployHash,
      deployer: account.address,
      permit2Address: PERMIT2_ADDRESS,
      timestamp: new Date().toISOString(),
      compilerVersion: `v${solcVersion}`,
      optimizationRuns: 200,
    };

    const deploymentInfoPath = join(__dirname, "deployment-result.json");
    writeFileSync(deploymentInfoPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`Deployment info saved to ${deploymentInfoPath}`);

    // Return deployment info for verification
    return deploymentInfo;
  } catch (error) {
    console.error(`Deployment error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    throw error;
  } finally {
    // Clean up temp files
    try {
      exec(`rm -rf ${tempDir}`);
    } catch (e) {
      console.warn(`Could not clean up temp directory: ${e}`);
    }
  }
}

/**
 * Verify contract on Gnosisscan
 */
async function verifyContract(deploymentInfo: any) {
  const { contractAddress } = deploymentInfo;
  console.log(`Verifying contract at ${contractAddress} on Gnosis Chain...`);

  // Read contract source code
  const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
  const sourceCode = readFileSync(contractPath, "utf8");

  // Prepare verification request
  const apiUrl = "https://api.gnosisscan.io/api";
  const constructorArgs = "000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3"; // PERMIT2_ADDRESS encoded

  const params = new URLSearchParams();
  params.append("apikey", GNOSISSCAN_API_KEY);
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("contractaddress", contractAddress);
  params.append("sourceCode", sourceCode);
  params.append("codeformat", "solidity-single-file");
  params.append("contractname", "PermitAggregator");
  params.append("compilerversion", "v0.8.20+commit.a1b79de6");
  params.append("optimizationUsed", "1");
  params.append("runs", "200");
  params.append("constructorArguments", constructorArgs);
  params.append("licenseType", "3"); // MIT License

  try {
    // Submit verification request
    console.log("Submitting verification request...");
    const response = await axios.post(apiUrl, params.toString(), {
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

    // Check verification status
    let verified = false;
    for (let i = 0; i < 10; i++) {
      // Wait before checking status
      const delay = Math.min(5000 * Math.pow(1.5, i), 30000); // Max 30 seconds
      await setTimeout(delay);

      // Check verification status
      const statusParams = new URLSearchParams();
      statusParams.append("apikey", GNOSISSCAN_API_KEY);
      statusParams.append("module", "contract");
      statusParams.append("action", "checkverifystatus");
      statusParams.append("guid", guid);

      const statusResponse = await axios.get(`${apiUrl}?${statusParams.toString()}`);
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
  } catch (error) {
    console.error(`Verification error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("Redeploying and Verifying PermitAggregator on Gnosis Chain");
  console.log("=======================================================");

  try {
    // Deploy contract
    console.log("\n=== DEPLOYMENT ===");
    const deploymentInfo = await deployContract();

    // Wait a bit before attempting verification
    console.log("\nWaiting 30 seconds before attempting verification...");
    await setTimeout(30000);

    // Verify contract
    console.log("\n=== VERIFICATION ===");
    const verified = await verifyContract(deploymentInfo);

    // Final result
    if (verified) {
      console.log("\n✅ Contract successfully deployed and verified!");
      console.log(`Contract address: ${deploymentInfo.contractAddress}`);
      console.log(`View on Gnosisscan: https://gnosisscan.io/address/${deploymentInfo.contractAddress}#code`);
    } else {
      console.warn("\n⚠️ Contract deployed but verification failed");
      console.log(`Contract address: ${deploymentInfo.contractAddress}`);
      console.log(`View on Gnosisscan: https://gnosisscan.io/address/${deploymentInfo.contractAddress}`);
    }

    return { success: true, deploymentInfo };
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return { success: false, error: String(error) };
  }
}

// Run the script
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { deployContract, verifyContract };
