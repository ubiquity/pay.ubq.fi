// generate permit2 message
// show URL to UI permit2 page

import { randomBytes } from "crypto";
import * as dotenv from "dotenv";
import { BigNumber, ethers } from "ethers";
import { MaxUint256, PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";

dotenv.config();

// constants set once
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all chains

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_PROVIDER_URL);
  const myWallet = new ethers.Wallet(process.env.UBIQUIBOT_PRIVATE_KEY || "", provider);

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

  const { domain, types, values } = SignatureTransfer.getPermitData(permitTransferFromData, PERMIT2_ADDRESS, process.env.CHAIN_ID ? +process.env.CHAIN_ID : 1);
  const signature = await myWallet._signTypedData(domain, types, values);
  const txData = {
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
  };

  const base64encodedTxData = Buffer.from(JSON.stringify(txData)).toString("base64");
  console.log("Share this URL with a bounty hunter:");
  console.log(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
