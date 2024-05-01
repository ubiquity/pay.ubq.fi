import { MaxUint256, PermitTransferFrom } from "@uniswap/permit2-sdk";
import * as dotenv from "dotenv";
import { ethers, solidityPackedKeccak256 } from "ethers";
import { log } from "./utils";
dotenv.config();

const NFT_REWARDS_ANVIL_DEPLOYMENT = "0x38a70c040ca5f5439ad52d0e821063b0ec0b52b6";
const ANVIL_ACC_2_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ANVIL_ACC_1_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const NFT_ADDRESS = "0xAa1bfC0e51969415d64d6dE74f27CDa0587e645b";

const GITHUB_REPOSITORY_NAME = "pay.ubq.fi";
const CHAIN_ID = Number(process.env.CHAIN_ID);
let network: string;
if (CHAIN_ID === 1) {
  network = "mainnet";
} else if (CHAIN_ID === 100) {
  network = "gnosis";
} else if (CHAIN_ID === 31337) {
  network = "localhost";
} else {
  network = "unknown";
}

function createProviderAndWallet() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_PROVIDER_URL);
  const myWallet = new ethers.Wallet(ANVIL_ACC_2_PRIVATE_KEY, provider);
  return { provider, myWallet };
}

function createPermitTransferFromData(myWallet: ethers.Wallet, nonce: number) {
  return {
    permitted: {
      token: network == "localhost" ? NFT_REWARDS_ANVIL_DEPLOYMENT : NFT_ADDRESS,
      amount: 1,
    },
    spender: network == "localhost" ? ANVIL_ACC_1_ADDRESS : myWallet.address,
    nonce: nonce,
    deadline: MaxUint256,
  };
}

async function signTypedData(myWallet: ethers.Wallet, mintRequest: ReturnType<typeof createMintRequest>) {
  const SIGNING_DOMAIN_NAME = "NftReward-Domain";
  const SIGNING_DOMAIN_VERSION = "1";
  const VERIFYING_CONTRACT_ADDRESS = network == "localhost" ? NFT_REWARDS_ANVIL_DEPLOYMENT : NFT_ADDRESS;
  const domain = {
    name: SIGNING_DOMAIN_NAME,
    version: SIGNING_DOMAIN_VERSION,
    verifyingContract: VERIFYING_CONTRACT_ADDRESS,
    chainId: CHAIN_ID,
  };
  const types = {
    MintRequest: [
      { name: "beneficiary", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "keys", type: "bytes32[]" },
      { name: "nonce", type: "uint256" },
      { name: "values", type: "string[]" },
    ],
  };
  return await myWallet._signTypedData(domain, types, mintRequest);
}

function createMintRequest(myWallet: ethers.Wallet, valueBytes: string[], nonce: number) {
  const GITHUB_ORGANIZATION_NAME = "ubiquity";

  const GITHUB_ISSUE_ID = "1";
  const GITHUB_USERNAME = "testing";
  const GITHUB_CONTRIBUTION_TYPE = "issue";
  return {
    beneficiary: network == "localhost" ? ANVIL_ACC_1_ADDRESS : myWallet.address,
    deadline: MaxUint256,
    keys: valueBytes,
    nonce: nonce,
    values: [GITHUB_ORGANIZATION_NAME, GITHUB_REPOSITORY_NAME, GITHUB_ISSUE_ID, GITHUB_USERNAME, GITHUB_CONTRIBUTION_TYPE],
  };
}

function createTxData(myWallet: ethers.Wallet, erc721TransferFromData: PermitTransferFrom, signature: string, valueBytes: unknown[]) {
  const GITHUB_ORGANIZATION_NAME = "ubiquity";

  const GITHUB_ISSUE_ID = "1";
  const GITHUB_USERNAME = "testing";
  const GITHUB_CONTRIBUTION_TYPE = "issue";
  return {
    type: "erc721-permit",
    permit: {
      permitted: {
        token: erc721TransferFromData.permitted.token,
        amount: erc721TransferFromData.permitted.amount.toString(),
      },
      nonce: erc721TransferFromData.nonce.toString(),
      deadline: erc721TransferFromData.deadline.toString(),
    },
    transferDetails: {
      to: erc721TransferFromData.spender,
      requestedAmount: erc721TransferFromData.permitted.amount.toString(),
    },
    owner: myWallet.address,
    signature: signature,
    networkId: CHAIN_ID,
    nftMetadata: {
      GITHUB_ORGANIZATION_NAME,
      GITHUB_REPOSITORY_NAME,
      GITHUB_ISSUE_ID,
      GITHUB_USERNAME,
      GITHUB_CONTRIBUTION_TYPE,
    },
    request: {
      beneficiary: network == "localhost" ? ANVIL_ACC_1_ADDRESS : myWallet.address,
      deadline: erc721TransferFromData.deadline.toString(),
      keys: valueBytes,
      nonce: erc721TransferFromData.nonce.toString(),
      values: [GITHUB_ORGANIZATION_NAME, GITHUB_REPOSITORY_NAME, GITHUB_ISSUE_ID, GITHUB_USERNAME, GITHUB_CONTRIBUTION_TYPE],
    },
  };
}

export async function generateERC721Permit() {
  const { myWallet } = createProviderAndWallet();
  const GITHUB_ORGANIZATION_NAME = "ubiquity";

  const GITHUB_ISSUE_ID = "1";
  const GITHUB_USERNAME = "testing";
  const GITHUB_CONTRIBUTION_TYPE = "issue";
  const valueBytes = [
    solidityPackedKeccak256(["string"], [GITHUB_ORGANIZATION_NAME]),
    solidityPackedKeccak256(["string"], [GITHUB_REPOSITORY_NAME]),
    solidityPackedKeccak256(["string"], [GITHUB_ISSUE_ID]),
    solidityPackedKeccak256(["string"], [GITHUB_USERNAME]),
    solidityPackedKeccak256(["string"], [GITHUB_CONTRIBUTION_TYPE]),
  ];

  const erc721TransferFromData = createPermitTransferFromData(myWallet, 313327);
  const mintRequest = createMintRequest(myWallet, valueBytes, 313327);
  const signature = await signTypedData(myWallet, mintRequest);

  const erc721TransferFromData2 = createPermitTransferFromData(myWallet, 3137);
  const mintRequest2 = createMintRequest(myWallet, valueBytes, 3137);
  const sig = await signTypedData(myWallet, mintRequest2);

  const txData721 = [createTxData(myWallet, erc721TransferFromData, signature, valueBytes), createTxData(myWallet, erc721TransferFromData2, sig, valueBytes)];

  const base64encodedTxData721 = Buffer.from(JSON.stringify(txData721)).toString("base64");

  log.ok("ERC721 Local URL:");
  log.info(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData721}`);
}
