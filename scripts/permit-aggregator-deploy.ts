/**
 * Deployment script for PermitAggregator.sol
 * Run with: bun run scripts/permit-aggregator-deploy.ts [chainId]
 * Example: bun run scripts/permit-aggregator-deploy.ts 12345
 * Requires Bun/Node, not Deno.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, http, concat, encodeFunctionData, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeDeployData } from "viem/utils";
import process from "node:process";

// Universal addresses that are the same across all chains
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Use fixed salt for deterministic address across all chains
const PERMIT_AGGREGATOR_SALT = "0x0000000000000000000000000000000000000000000000000000000000000001";
// CREATE2 factory address is the same on all chains
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

type NetworkConfig = {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  configKey: string;
  name: string;
};

function compileContract(contractPath: string, contractName: string) {
  const source = readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      [contractName]: { content: source },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Print compilation errors/warnings if any
  if (output.errors && Array.isArray(output.errors)) {
    let hasError = false;
    for (const err of output.errors) {
      if (err.severity === "error") {
        hasError = true;
        console.error("Solidity compile error:", err.formattedMessage || err.message);
      } else {
        console.warn("Solidity compile warning:", err.formattedMessage || err.message);
      }
    }
    if (hasError) {
      throw new Error("Solidity compilation failed. See errors above.");
    }
  }

  // Get compiled contract from output
  const contract = output.contracts[contractName]?.PermitAggregator;
  if (!contract || !contract.abi || !contract.evm?.bytecode?.object) {
    throw new Error(
      "Invalid compilation output. Check if contract name matches and Solidity version is compatible."
    );
  }
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

// Get deterministic CREATE2 address (same across all chains)
function getCreate2Address(bytecode: string, abi: any[], constructorArgs: any[]) {
  const initCode = encodeDeployData({
    abi,
    bytecode: bytecode as `0x${string}`,
    args: constructorArgs,
  });

  const hash = keccak256(
    concat([
      toBytes("0xff"),
      toBytes(CREATE2_FACTORY),
      toBytes(PERMIT_AGGREGATOR_SALT),
      keccak256(initCode)
    ])
  );

  return `0x${hash.slice(26)}`;
}

async function deploy(network: NetworkConfig, abi: any, bytecode: string) {
  if (!network.rpcUrl || !network.privateKey) {
    throw new Error(`Missing RPC URL or private key`);
  }

  const privateKey = network.privateKey.startsWith('0x') ? network.privateKey : `0x${network.privateKey}`;
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: { id: network.chainId, name: network.name, rpcUrls: { default: { http: [network.rpcUrl] } } },
    transport: http(network.rpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: { id: network.chainId, name: network.name, rpcUrls: { default: { http: [network.rpcUrl] } } },
    transport: http(network.rpcUrl),
  });

  // Generate initialization code (contract bytecode + constructor args)
  const initCode = encodeDeployData({
    abi,
    bytecode: bytecode as `0x${string}`,
    args: [PERMIT2_ADDRESS],
  });

  // Deploy using CREATE2 factory
  const hash = await walletClient.writeContract({
    address: CREATE2_FACTORY,
    abi: [{
      inputs: [
        { name: "salt", type: "bytes32" },
        { name: "initializationCode", type: "bytes" }
      ],
      name: "deploy",
      outputs: [{ name: "createdContract", type: "address" }],
      stateMutability: "nonpayable",
      type: "function"
    }],
    functionName: "deploy",
    args: [PERMIT_AGGREGATOR_SALT, initCode],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  // Calculate expected address
  const expectedAddress = getCreate2Address(bytecode, abi, [PERMIT2_ADDRESS]);

  // Verify deployment
  const code = await publicClient.getBytecode({ address: expectedAddress });
  if (!code) throw new Error("Deployment failed - no code at expected address");

  return expectedAddress;
}

function updateFrontendConfig(configPath: string, key: string, address: string) {
  let config = readFileSync(configPath, "utf8");
  const regex = new RegExp(`(${key}:\\s*['"\`])0x[a-fA-F0-9]{40}(['"\`])`);
  if (regex.test(config)) {
    config = config.replace(regex, `$1${address}$2`);
  } else {
    config += `\nexport const ${key} = "${address}";\n`;
  }
  writeFileSync(configPath, config, "utf8");
}

async function main() {
  const chainIdArg = process.argv[2];
  if (!chainIdArg || isNaN(Number(chainIdArg))) {
    console.error("Usage: bun run scripts/permit-aggregator-deploy.ts [chainId]");
    process.exit(1);
  }
  const chainId = Number(chainIdArg);
  // First calculate expected address without deploying
  const { abi, bytecode } = compileContract(join(__dirname, "..", "contracts", "PermitAggregator.sol"), "PermitAggregator.sol");
  const expectedAddress = getCreate2Address(bytecode, abi, [PERMIT2_ADDRESS]);
  writeFileSync("expected-address.txt", expectedAddress);
  console.log(`Expected PermitAggregator address on all chains: ${expectedAddress}`);

  // Only deploy if DEPLOYER_PRIVATE_KEY is provided
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.log("Skipping deployment - DEPLOYER_PRIVATE_KEY not provided");
    process.exit(0);
  }

  const network: NetworkConfig = {
    rpcUrl: `https://rpc.ubq.fi/${chainId}`,
    chainId,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    configKey: `PERMIT_AGGREGATOR_CONTRACT_ADDRESS`,
    name: `Chain${chainId}`,
  };
  const address = await deploy(network, abi, bytecode);
  console.log(`Deployed PermitAggregator to chain ${chainId}: ${address}`);
  updateFrontendConfig(
    join(__dirname, "..", "frontend", "src", "constants", "config.ts"),
    network.configKey,
    address
  );
  console.log(`Updated frontend config with ${network.configKey}: ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
