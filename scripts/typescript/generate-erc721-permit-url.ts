import { MaxUint256, PermitTransferFrom } from "@uniswap/permit2-sdk";
import * as dotenv from "dotenv";
import {  ethers } from "ethers";
import { log } from "./utils";
import { solidityKeccak256 } from "ethers/lib/utils";
dotenv.config();

const NFT_REWARDS_ANVIL_DEPLOYMENT = "0x38A70c040CA5F5439ad52d0e821063b0EC0B52b6"; // Address when using Anvil acc 1 on forked Gnosis
const ANVIL_ACC_1_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
// const NFT_ADDRESS = "0xAa1bfC0e51969415d64d6dE74f27CDa0587e645b"; // Real Gnosis address

  /**
   * hardcoded digest signature for the below txData721.request object
   * anvil --chain-id 31337 --fork-url https//...
   * nft-rewards repo: forge script ./script/Deploy001_NftReward.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
   * 
   * string[] memory values = new string[](5);
   * values[0] = "ubiquity";
   * values[1] = "pay.ubq.fi";
   * values[2] = "1";
   * values[3] = "testing";
   * values[4] = "issue";
   * 
   * bytes32[] memory keys = new bytes32[](5);
   * keys[0] = 0x1c474488c03c83ad98714cfe3a60c752036f92ab8378227adfcb13585f115c5c;
   * keys[1] = 0x0480f34997cc2d3abc2dafd652b25652ba845458fc3e3692f28acbd4920a37ea;
   * keys[2] = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;
   * keys[3] = 0x5f16f4c7f149ac4f9510d9cf8cf384038ad348b3bcdc01915f95de12df9d1b02;
   * keys[4] = 0xa33d0fabbfddf3db8e1458550edc0ab7e061990c85809d25341eab0885973d7d;
   * 
   * MintRequest memory _mintRequest = MintRequest({
   *     beneficiary: ANVIL_ACC_1, // (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266),
   *     deadline: type(uint256).max,
   *     keys: keys,
   *     nonce: 31337,
   *     values: values
   * });
   * 
   * `Signed not by minter` error thrown trying to generate it on the fly
   * SignatureTransfer.getPermitData() expects the permitTransferFrom details, not the request object
   * so myWallet._signTypedData(domain, types, values) signs the permitTransferFrom details
   * 
   * whereas the nftRewards contract recovers against the signed request digest
   * which is typedDataHashed within the contract, so we are only signing a hash
   * which from a claim portal standpoint shouldn't need to change the signature
   * admittedly, I'm not sure how to generate it on the fly so hardcoded for now
   */

export async function generateERC721Permit() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_PROVIDER_URL);
  const myWallet = new ethers.Wallet(ANVIL_ACC_1_PRIVATE_KEY, provider);

  const GITHUB_CONTRIBUTION_TYPE = "issue";
  const GITHUB_ISSUE_ID = "1";
  const GITHUB_ORGANIZATION_NAME = "ubiquity";
  const GITHUB_REPOSITORY_NAME = "pay.ubq.fi";
  const GITHUB_USERNAME = "testing";
  const ANVIL_ACC_1 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const erc721TransferFromData: PermitTransferFrom = {
    permitted: {
      token: NFT_REWARDS_ANVIL_DEPLOYMENT, // anvil instance via nft-rewards repo
      amount: 1, 
    },
    spender: ANVIL_ACC_1, // anvil acc 1
    nonce: 31337,
    deadline: MaxUint256,
  };

  const valueBytes = [
    solidityKeccak256(["string"], [GITHUB_ORGANIZATION_NAME]),
    solidityKeccak256(["string"], [GITHUB_REPOSITORY_NAME]),
    solidityKeccak256(["string"], [GITHUB_ISSUE_ID]),
    solidityKeccak256(["string"], [GITHUB_USERNAME]),
    solidityKeccak256(["string"], [GITHUB_CONTRIBUTION_TYPE])
  ]

  const sig = "0x900f4c98c1829255903fbf57f46d7b2f9ad4e79f0abbd58b9921136319e7001d173e26d3560fe5dc674782d78f670f9c18d2b7356ced073df7410678f0981c411c";

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
      signature: sig,
      networkId: Number(process.env.CHAIN_ID), // fork gnosis with --chain-id 31337
      nftMetadata: {
        GITHUB_ORGANIZATION_NAME,
        GITHUB_REPOSITORY_NAME,
        GITHUB_ISSUE_ID,
        GITHUB_USERNAME,
        GITHUB_CONTRIBUTION_TYPE
      },
      request: {
        beneficiary: ANVIL_ACC_1,
        deadline: erc721TransferFromData.deadline.toString(),
        keys: valueBytes,
        nonce: erc721TransferFromData.nonce.toString(),
        values: [
          GITHUB_ORGANIZATION_NAME,
          GITHUB_REPOSITORY_NAME,
          GITHUB_ISSUE_ID,
          GITHUB_USERNAME,
          GITHUB_CONTRIBUTION_TYPE
        ]
      },
    },
  ];

  const base64encodedTxData721 = Buffer.from(JSON.stringify(txData721)).toString("base64");

  // log.ok("ERC721 Public URL:");
  // console.log(`https://pay.ubq.fi?claim=${base64encodedTxData721}`);

  // console.log("\n")

  log.ok("ERC721 Local URL:");
  console.log(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData721}`);
}
