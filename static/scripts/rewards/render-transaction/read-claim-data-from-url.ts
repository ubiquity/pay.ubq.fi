import { createClient } from "@supabase/supabase-js";
import { decodePermits } from "@ubiquibot/permit-generation/handlers";
import { Permit } from "@ubiquibot/permit-generation/types";
import { app, AppState } from "../app-state";
import { toaster } from "../toaster";
import { buttonController } from "../button-controller";

import { connectWallet } from "../web3/connect-wallet";
import { checkRenderInvalidatePermitAdminControl, checkRenderMakeClaimControl } from "../web3/erc20-permit";
import { claimRewardsPagination } from "./claim-rewards-pagination";
import { renderTransaction } from "./render-transaction";
import { setClaimMessage } from "./set-claim-message";
import { useRpcHandler } from "../../../../shared/use-rpc-handler";
import { switchNetwork } from "../web3/switch-network";
import { ethers } from "ethers";
import { getNetworkName, NetworkId } from "@ubiquity-dao/rpc-handler";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const table = document.getElementsByTagName(`table`)[0];
const urlParams = new URLSearchParams(window.location.search);
const base64encodedTxData = urlParams.get("claim");

export async function readClaimDataFromUrl(app: AppState) {
  if (!base64encodedTxData) {
    // No claim data found
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-make-claim`, "error");
    return;
  }

  app.claims = decodeClaimData(base64encodedTxData);
  app.claimTxs = await getClaimedTxs(app);

  try {
    app.provider = await useRpcHandler(app.networkId ?? app.reward.networkId);
  } catch (e) {
    if (e instanceof Error) {
      toaster.create("error", e.message);
    } else {
      toaster.create("error", JSON.stringify(e));
    }
  }

  try {
    app.signer = await connectWallet();
  } catch (error) {
    /* empty */
  }

  await updateButtonVisibility(app);

  displayRewardDetails();
  displayRewardPagination();

  await renderTransaction();
}

export async function updateButtonVisibility(app: AppState) {
  try {
    const currentNetworkId = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);

    const appId = app.networkId ?? app.reward.networkId;

    if (currentNetworkId !== appId) {
      console.warn(`Incorrect network. Expected ${appId}, but got ${currentNetworkId}.`);
      buttonController.hideAll(); // Hide all buttons if the network is incorrect
      toaster.create("error", `This dApp currently does not support payouts for network ID ${currentNetworkId}`);

      // Try switching to the proper network id
      switchNetwork(new ethers.providers.Web3Provider(window.ethereum), appId).catch((error) => {
        console.error(error);
        if (app.networkId !== null) {
          toaster.create("error", `Please switch to the ${getNetworkName(String(appId) as NetworkId)} network to claim this reward.`);
        }
      });

      return; // Stop further checks if the network is incorrect
    }

    await checkRenderMakeClaimControl(app);
    await checkRenderInvalidatePermitAdminControl(app);
  } catch (error) {
    console.error("Error updating button visibility:", error);
    buttonController.hideAll(); // Hide all buttons if there's an error
  }
}

// Below is a listener that updates buttons on account/network change
if (window.ethereum) {
  // Handle account changes
  window.ethereum.on("accountsChanged", async () => {
    await updateButtonVisibility(app);
  });

  // Handle network changes
  window.ethereum.on("chainChanged", async () => {
    await updateButtonVisibility(app);
  });
} else {
  console.warn("Ethereum provider not detected.");
}

async function getClaimedTxs(app: AppState): Promise<Record<string, string>> {
  const txs: Record<string, string> = Object.create(null);
  for (const claim of app.claims) {
    const { data } = await supabase.from("permits").select("transaction").eq("nonce", claim.nonce.toString());

    if (data?.length == 1 && data[0].transaction !== null) {
      txs[claim.nonce.toString()] = data[0].transaction as string;
    }
  }
  return txs;
}

function decodeClaimData(base64encodedTxData: string): Permit[] {
  let permit;

  try {
    permit = decodePermits(base64encodedTxData);
    return permit;
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL` });
    table.setAttribute(`data-make-claim`, "error");
    throw error;
  }
}

function displayRewardPagination() {
  const rewardsCount = document.getElementById("rewardsCount");
  if (rewardsCount) {
    if (!app.claims || app.claims.length <= 1) {
      // already hidden
    } else {
      claimRewardsPagination(rewardsCount);
    }
  }
}

function displayRewardDetails() {
  let isDetailsVisible = false;
  table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  const additionalDetails = document.getElementById(`additionalDetails`) as HTMLElement;
  additionalDetails.addEventListener("click", () => {
    isDetailsVisible = !isDetailsVisible;
    table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  });
}
