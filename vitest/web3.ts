import { spawn } from "child_process";
import express from "express";
import dotenv from "dotenv";
import { JsonRpcProvider } from "@ethersproject/providers";
import { decodePermits } from "@ubiquibot/permit-generation/handlers";
import { ethers } from "ethers";
import { permit2Address } from "@ubiquity-dao/rpc-handler";
import { giftCardTreasuryAddress } from "../shared/constants";
import { permit2Abi } from "../static/scripts/rewards/abis/permit2-abi";
import { PermitReward } from "@ubiquibot/permit-generation";
import { generateErc20Permit } from "../scripts/typescript/generate-erc20-permit-url";
import { AppState } from "../static/scripts/rewards/app-state";

const beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
// const SENDER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SENDER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const app = new AppState();

// Run anvil
export async function startAnvilInstance() {
  const anvil = spawn("anvil", ["--chain-id", "31337", "--fork-url", "https://rpc.gnosis.gateway.fm", "--host", "127.0.0.1", "--port", "8545"], {
    stdio: "inherit",
  });

  anvil.on("close", (code) => {
    console.log(`Anvil exited with code ${code}`);
  });

  anvil.on("error", (err) => {
    console.error("Failed to start Anvil", err);
  });
}

async function createMockApp() {
  const permitUrl = await generateErc20Permit(process.env);
  const base64encodedTxData = permitUrl.split("=")[1];
  // Create a mock app state
  app.claims = decodePermits(base64encodedTxData);
  app.claimTxs = {};
  const provider = new JsonRpcProvider("http://localhost:8545");
  app.signer = provider.getSigner(beneficiary);
}

async function createMockTransfer(reward: PermitReward) {
  if (!app.signer) return;
  const provider = new JsonRpcProvider(process.env.RPC_PROVIDER_URL);
  const wallet = new ethers.Wallet(SENDER_PRIVATE_KEY, provider);
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, wallet);

  reward.beneficiary = giftCardTreasuryAddress;
  const { tokenAddress, amount, nonce, deadline, owner, signature, beneficiary } = reward;

  try {
    const tx = await permit2Contract.permitTransferFrom(
      {
        permitted: {
          token: tokenAddress,
          amount,
        },
        nonce,
        deadline,
      },
      { to: beneficiary, requestedAmount: amount },
      owner,
      signature,
      {
        gasLimit: 100000,
      }
    );
    await tx.wait();
    return tx;
  } catch (err) {
    console.log(err);
  }
}

dotenv.config();

const webApp = express();
const port = process.env.PORT ?? 3000;

// eslint-disable-next-line @typescript-eslint/naming-convention
webApp.get("/", (_req, res: { send: (arg0: string) => void }) => {
  res.send("Express + TypeScript Server");
});

webApp.post("/create-mock-app", async (req, res) => {
  try {
    await createMockApp();
    res.json({
      success: true,
      permits: app.claims,
    });
  } catch (error) {
    res.status(500).json({
      error: "Error creating mock app",
    });
  }
});

webApp.post("/create-mock-transfer", async (req, res) => {
  try {
    await createMockTransfer(app.claims[1]);
  } catch (error) {
    res.status(500).json({
      // @ts-expect-error you suck
      error: error.message,
      reward: app.claims[0],
    });
  }
});

webApp.listen(port, async () => {
  await startAnvilInstance();
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
