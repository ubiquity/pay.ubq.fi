import { MaxUint256, PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { randomBytes } from "crypto";
import * as dotenv from "dotenv";
import { BigNumber, ethers } from "ethers";
import { log, verifyEnvironmentVariables } from "./utils";
dotenv.config();

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all chains

generate().catch((error) => {
  console.error(error);
  verifyEnvironmentVariables();
  process.exitCode = 1;
});

async function generate() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_PROVIDER_URL);
  const myWallet = new ethers.Wallet(process.env.UBIQUIBOT_PRIVATE_KEY || "", provider);

  const erc721TransferFromData: PermitTransferFrom = {
    permitted: {
      token: process.env.NFT_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3", // anvil no salt first acc NFT deployment
      amount: 1, // this could be the tokenId if the permit is identified as an NFT via permitType
    },
    spender: process.env.BENEFICIARY_ADDRESS || "",
    nonce: BigNumber.from(`0x${randomBytes(32).toString("hex")}`),
    deadline: MaxUint256,
  };

  const { domain: domain721, types: types721, values: values721 } = SignatureTransfer.getPermitData(
    erc721TransferFromData,
    PERMIT2_ADDRESS,
    process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1
  );

  const signature721 = await myWallet._signTypedData(domain721, types721, values721);

  const GITHUB_CONTRIBUTION_TYPE = process.env.GITHUB_CONTRIBUTION_TYPE || "issue";
  const GITHUB_ISSUE_ID = process.env.GITHUB_ISSUE_ID || "1";
  const GITHUB_ORGANIZATION_NAME = process.env.GITHUB_ORGANIZATION_NAME || "ubiquity";
  const GITHUB_REPOSITORY_NAME = process.env.GITHUB_REPOSITORY_NAME || "pay.ubq.fi";
  const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "keyrxng";

  const txData721 = [
    {
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
      signature: signature721,
      networkId: Number(process.env.CHAIN_ID),
      nftMetadata: {
        GITHUB_ORGANIZATION_NAME,
        GITHUB_REPOSITORY_NAME,
        GITHUB_ISSUE_ID,
        GITHUB_USERNAME,
        GITHUB_CONTRIBUTION_TYPE
      },
      request: {
        beneficiary: process.env.BENEFICIARY_ADDRESS ?? "",
        deadline: erc721TransferFromData.deadline.toString(),
        keys: ["GITHUB_ORGANIZATION_NAME", "GITHUB_REPOSITORY_NAME", "GITHUB_ISSUE_ID", "GITHUB_USERNAME", "GITHUB_CONTRIBUTION_TYPE"],
        nonce: erc721TransferFromData.nonce.toString(),
        values: [GITHUB_ORGANIZATION_NAME, GITHUB_REPOSITORY_NAME, GITHUB_ISSUE_ID, GITHUB_USERNAME, GITHUB_CONTRIBUTION_TYPE],
      },
    },
  ];

  const base64encodedTxData721 = Buffer.from(JSON.stringify(txData721)).toString("base64");
  log.ok("Testing URL:");
  console.log(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData721}`);
  log.ok("Public URL:");
  console.log(`https://pay.ubq.fi?claim=${base64encodedTxData721}`);
  console.log();

  const permitTransferFromData: PermitTransferFrom = {
    permitted: {
      // token we are permitting to be transferred
      token: process.env.PAYMENT_TOKEN_ADDRESS || "",
      // amount we are permitting to be transferred
      amount: ethers.utils.parseUnits(process.env.AMOUNT_IN_ETH || "", 18),
    },
    // who can transfer the tokens
    spender: process.env.BENEFICIARY_ADDRESS || "",
    nonce: BigNumber.from(`0x${randomBytes(32).toString("hex")}`),
    // signature deadline
    deadline: MaxUint256,
  };

  const { domain, types, values } = SignatureTransfer.getPermitData(
    permitTransferFromData,
    PERMIT2_ADDRESS,
    process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1
  );
  const signature = await myWallet._signTypedData(domain, types, values);

  const txData = [
    {
      type: "erc20-permit",
      permit: {
        permitted: {
          token: permitTransferFromData.permitted.token,
          amount: permitTransferFromData.permitted.amount.toString(),
        },
        nonce: permitTransferFromData.nonce.toString(),
        deadline: permitTransferFromData.deadline.toString(),
      },
      transferDetails: {
        to: permitTransferFromData.spender,
        requestedAmount: permitTransferFromData.permitted.amount.toString(),
      },
      owner: myWallet.address,
      signature: signature,
      networkId: Number(process.env.CHAIN_ID),
    },
  ];

  const base64encodedTxData = Buffer.from(JSON.stringify(txData)).toString("base64");
  log.ok("Testing URL:");
  console.log(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData}`);
  log.ok("Public URL:");
  console.log(`https://pay.ubq.fi?claim=${base64encodedTxData}`);
  console.log();
}
