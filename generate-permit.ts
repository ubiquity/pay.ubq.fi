// test mnemonic: whale pepper wink eight disease negative renew volume dream forest clean rent

// Address 1: 0xa701216C86b1fFC1F0E4D592DA4186eD519eaDf9
// Address 2: 0x398cb4c0a4821667373DDEB713dd3371c968460b

// Address 1 PK: 3ba514123c22fe4179289b1226900842bbef2f2eb474fc48c094d30dc6163a28
// Address 2 PK: 9d5c47372b05da22e903247b8c1d3e4ab4c3d27983476bcb7a02f2b531bc3bbe

import { MaxUint256, PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { ethers } from "ethers";
import PERMIT2_ABI from "./permit2.abi.json";

// constants set once
const RPC_PROVIDER_URL = "https://goerli.infura.io/v3/42c7a210df614077867503863d375617";
const DAI_TOKEN_ADDRESS = "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844"; // mainnet: 0x6b175474e89094c44da98b954eedeac495271d0f, goerli: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
const OWNER_PRIVATE_KEY = "3ba514123c22fe4179289b1226900842bbef2f2eb474fc48c094d30dc6163a28";
const CHAIN_ID = 5; // mainnet: 1, goerli: 5
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all chains

// constants depening on a spender
const SPENDER_ADDRESS = "0x398cb4c0a4821667373DDEB713dd3371c968460b";
const AMOUNT = ethers.utils.parseUnits("1", 18); // 1 token, NOTICE: DAI allows infinite amount while in other stables (like USDC) you can select the amount to allow

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_PROVIDER_URL);
  const myWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, myWallet);

  const permitTransferFromData: PermitTransferFrom = {
    permitted: {
        // token we are permitting to be transferred
        token: DAI_TOKEN_ADDRESS,
        // amount we are permitting to be transferred
        amount: AMOUNT
    },
    // who can transfer the tokens
    spender: SPENDER_ADDRESS,
    nonce: Math.floor(Math.random() * 100000000000),
    // signature deadline
    deadline: MaxUint256,
  };

  const { domain, types, values } = SignatureTransfer.getPermitData(permitTransferFromData, PERMIT2_ADDRESS, CHAIN_ID);
  const signature = await myWallet._signTypedData(domain, types, values);
  console.log(values);
  console.log(signature);

  // bounty hunter sends a tx to withdraw a payout (or he could do it manually via etherscan UI)
  /*
  const bountyHunterPrivateKey = "9d5c47372b05da22e903247b8c1d3e4ab4c3d27983476bcb7a02f2b531bc3bbe";
  const bountyHunterWallet = new ethers.Wallet(bountyHunterPrivateKey, provider);
  const permit2ContractTest = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, bountyHunterWallet);
  const txData = {
    permit: {
      permitted: {
        token: DAI_TOKEN_ADDRESS,
        amount: AMOUNT.toString(),
      },
      nonce: values.nonce,
      deadline: values.deadline.toString(),
    },
    transferDetails: {
      to: SPENDER_ADDRESS,
      requestedAmount: AMOUNT.toString(),
    },
    owner: "0xa701216C86b1fFC1F0E4D592DA4186eD519eaDf9",
    signature: signature,
  };
  const receipt = await permit2ContractTest.permitTransferFrom(txData.permit, txData.transferDetails, txData.owner, txData.signature);
  console.log(receipt);
  */
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
