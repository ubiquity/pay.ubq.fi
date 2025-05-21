import { readFileSync } from "node:fs";
import solc from "solc";
import { encodeDeployData } from "viem/utils";

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Compile PermitAggregator
const source = readFileSync("contracts/PermitAggregator.sol", "utf8");
const input = {
  language: "Solidity",
  sources: {
    "PermitAggregator.sol": { content: source },
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode"],
      },
    },
    optimizer: { enabled: true, runs: 200 },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contract = output.contracts["PermitAggregator.sol"].PermitAggregator;
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

// Encode constructor args using viem
const deployData = encodeDeployData({
  abi,
  bytecode: bytecode as `0x${string}`,
  args: [PERMIT2_ADDRESS],
});

console.log(deployData);
