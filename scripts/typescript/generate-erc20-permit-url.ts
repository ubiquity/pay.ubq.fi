import { PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import * as dotenv from "dotenv";
import { JsonRpcProvider, MaxUint256, Wallet, parseUnits } from "ethers";
import { log } from "./utils";
dotenv.config();

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all chains

function createProviderAndWallet() {
  const provider = new JsonRpcProvider(process.env.RPC_PROVIDER_URL);
  const myWallet = new Wallet(process.env.UBIQUIBOT_PRIVATE_KEY, provider);
  return { provider, myWallet };
}

function createPermitTransferFromData(amount: string) {
  return {
    permitted: {
      token: process.env.PAYMENT_TOKEN_ADDRESS || "",
      amount: parseUnits(amount || "", 18),
    },
    spender: process.env.BENEFICIARY_ADDRESS,
    nonce: Math.max(1000, Math.floor(Math.random() * 1000000)),
    deadline: MaxUint256,
  };
}

async function signTypedData(myWallet: Wallet, permitTransferFromData: PermitTransferFrom) {
  const { domain, types, values } = SignatureTransfer.getPermitData(
    permitTransferFromData,
    PERMIT2_ADDRESS,
    process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 1
  );

  // not sure where the BigNumber is being inferred from
  // both getPermitData() and signTypedData() use TypedDataDomain which uses BigNumberish
  return await myWallet.signTypedData(domain, types, values);
}

function createTxData(myWallet: Wallet, permitTransferFromData: PermitTransferFrom, signature: string) {
  return {
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
  };
}

export async function generateERC20Permit() {
  const { myWallet } = createProviderAndWallet();

  const permitTransferFromData = createPermitTransferFromData(process.env.AMOUNT_IN_ETH);
  const signature = await signTypedData(myWallet, permitTransferFromData);

  // const permitTransferFromData2 = createPermitTransferFromData("9");
  const sig = await signTypedData(myWallet, permitTransferFromData);

  const txData = [createTxData(myWallet, permitTransferFromData, signature), createTxData(myWallet, permitTransferFromData, sig)];

  const base64encodedTxData = Buffer.from(JSON.stringify(txData)).toString("base64");

  log.ok("ERC20 Local URL:");
  log.info(`${process.env.FRONTEND_URL}?claim=${base64encodedTxData}`);
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      RPC_PROVIDER_URL: string;
      UBIQUIBOT_PRIVATE_KEY: string;
      PAYMENT_TOKEN_ADDRESS: string;
      BENEFICIARY_ADDRESS: string;
      CHAIN_ID: string;
      AMOUNT_IN_ETH: string;
      FRONTEND_URL: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */
