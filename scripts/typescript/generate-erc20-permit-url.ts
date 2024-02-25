import { MaxUint256, PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { randomBytes } from "crypto";
import * as dotenv from "dotenv";
import { BigNumber, ethers } from "ethers";
import { log } from "./utils";
dotenv.config();

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all chains

export async function generateERC20Permit() {
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

  const { domain, types, values } = SignatureTransfer.getPermitData(
    permitTransferFromData,
    PERMIT2_ADDRESS,
    process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1
  );
  const signature = await myWallet._signTypedData(domain, types, values);

  const permitTransferFromData2: PermitTransferFrom = {
    permitted: {
      // token we are permitting to be transferred
      token: process.env.PAYMENT_TOKEN_ADDRESS || "",
      // amount we are permitting to be transferred
      amount: ethers.utils.parseUnits("9" || "", 18),
    },
    // who can transfer the tokens
    spender: process.env.BENEFICIARY_ADDRESS || "",
    nonce: BigNumber.from(`0x${randomBytes(32).toString("hex")}`),
    // signature deadline
    deadline: MaxUint256,
  };

  const {
    domain: d,
    types: t,
    values: v,
  } = SignatureTransfer.getPermitData(permitTransferFromData2, PERMIT2_ADDRESS, process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1);
  const sig = await myWallet._signTypedData(d, t, v);

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
    {
      type: "erc20-permit",
      permit: {
        permitted: {
          token: permitTransferFromData2.permitted.token,
          amount: permitTransferFromData2.permitted.amount.toString(),
        },
        nonce: permitTransferFromData2.nonce.toString(),
        deadline: permitTransferFromData2.deadline.toString(),
      },
      transferDetails: {
        to: permitTransferFromData2.spender,
        requestedAmount: permitTransferFromData2.permitted.amount.toString(),
      },
      owner: myWallet.address,
      signature: sig,
      networkId: Number(process.env.CHAIN_ID),
    },
  ];

  const base64encodedTxData = Buffer.from(JSON.stringify(txData)).toString("base64");

  // log.ok("ERC20 Public URL:");
  // console.log(`https://pay.ubq.fi?claim=${base64encodedTxData}`);

  log.ok("ERC20 Testing URL:");
  console.log(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData}`);
}
