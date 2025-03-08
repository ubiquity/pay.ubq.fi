import { MaxUint256, PermitTransferFrom, SignatureTransfer } from "@uniswap/permit2-sdk";
import { randomBytes } from "crypto";
import * as dotenv from "dotenv";
import { BigNumber, ethers } from "ethers";
import { log } from "./utils";
dotenv.config();

export type PermitConfig = NodeJS.ProcessEnv;

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all chains

function createProviderAndWallet(permitConfig: PermitConfig) {
  const provider = new ethers.providers.JsonRpcProvider(permitConfig.RPC_PROVIDER_URL);
  const myWallet = new ethers.Wallet(permitConfig.UBIQUIBOT_PRIVATE_KEY, provider);
  return { provider, myWallet };
}

async function createPermitTransferFromData(permitConfig: PermitConfig) {
  // get payment token decimals
  const { provider } = createProviderAndWallet(permitConfig);
  const erc20Abi = ["function decimals() public view returns (uint8)"];
  const tokenContract = new ethers.Contract(permitConfig.PAYMENT_TOKEN_ADDRESS, erc20Abi, provider);
  const tokenDecimals = await tokenContract.decimals();

  return {
    permitted: {
      token: permitConfig.PAYMENT_TOKEN_ADDRESS || "",
      amount: ethers.utils.parseUnits(permitConfig.AMOUNT_IN_ETH || "", tokenDecimals),
    },
    spender: permitConfig.BENEFICIARY_ADDRESS,
    nonce: BigNumber.from(`0x${randomBytes(32).toString("hex")}`),
    deadline: MaxUint256,
  };
}

async function signTypedData(myWallet: ethers.Wallet, permitTransferFromData: PermitTransferFrom, permitConfig: PermitConfig) {
  const { domain, types, values } = SignatureTransfer.getPermitData(
    permitTransferFromData,
    PERMIT2_ADDRESS,
    permitConfig.CHAIN_ID ? Number(permitConfig.CHAIN_ID) : 1
  );
  return await myWallet._signTypedData(domain, types, values);
}

function createTxData(myWallet: ethers.Wallet, permitTransferFromData: PermitTransferFrom, signature: string, permitConfig: PermitConfig) {
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
    networkId: Number(permitConfig.CHAIN_ID),
  };
}

export async function generateErc20Permit(permitConfig: PermitConfig) {
  const { myWallet } = createProviderAndWallet(permitConfig);

  const permitTransferFromData = await createPermitTransferFromData(permitConfig);
  const signature = await signTypedData(myWallet, permitTransferFromData, permitConfig);

  const permitTransferFromData2 = await createPermitTransferFromData({ ...permitConfig, AMOUNT_IN_ETH: "9" });
  const sig = await signTypedData(myWallet, permitTransferFromData2, permitConfig);

  const txData = [createTxData(myWallet, permitTransferFromData, signature, permitConfig), createTxData(myWallet, permitTransferFromData2, sig, permitConfig)];

  const base64encodedTxData = Buffer.from(JSON.stringify(txData)).toString("base64");

  return `${permitConfig.FRONTEND_URL}?claim=${base64encodedTxData}`;
}

export async function generateMultipleErc20Permits(permitConfig: PermitConfig, count: number = 3) {
  const { myWallet } = createProviderAndWallet(permitConfig);
  const txDataArray = [];

  console.log("Generating multiple ERC20 permits...");

  for (let i = 0; i < count; i++) {
    const permitTransferFromData = await createPermitTransferFromData(permitConfig);
    const signature = await signTypedData(myWallet, permitTransferFromData, permitConfig);
    const txData = createTxData(myWallet, permitTransferFromData, signature, permitConfig);
    txDataArray.push(txData);
  }

  const base64encodedTxData = Buffer.from(JSON.stringify(txDataArray)).toString("base64");

  return `${permitConfig.FRONTEND_URL}?claim=${base64encodedTxData}`;
}

export async function logErc20Permit(permitConfig: PermitConfig) {
  const erc20Permits = await generateMultipleErc20Permits(permitConfig);
  log.ok("ERC20 Local URL:");
  log.info(erc20Permits);
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
