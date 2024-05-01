import { createClient } from "@supabase/supabase-js";
import { decodePermits } from "@ubiquibot/permit-generation/handlers";
import { Permit } from "@ubiquibot/permit-generation/types";
import { app, AppState } from "../app-state";
import { useFastestRpc } from "../rpc-optimization/get-optimal-provider";
import { getButtonController, toaster } from "../toaster";
import { connectWallet } from "../web3/connect-wallet";
import { checkRenderInvalidatePermitAdminControl, checkRenderMakeClaimControl } from "../web3/erc20-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { claimRewardsPagination } from "./claim-rewards-pagination";
import { renderTransaction } from "./render-transaction";
import { setClaimMessage } from "./set-claim-message";

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export async function readClaimDataFromUrl(app: AppState, permits?: string) {
  const base64encodedTxData = permits;
  const table = document.getElementsByTagName(`table`)[0];

  if (!base64encodedTxData) {
    // No claim data found
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-make-claim`, "error");
    return;
  }

  app.claims = decodeClaimData(base64encodedTxData);
  app.claimTxs = await getClaimedTxs(app);
  try {
    app.provider = await useFastestRpc(app);
  } catch (e) {
    toaster.create("error", `${e}`);
  }

  try {
    app.signer = await connectWallet();
    window.ethereum.on("accountsChanged", () => {
      checkRenderMakeClaimControl(app).catch(console.error);
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    });
  } catch (error) {
    /* empty */
  }

  displayRewardDetails();
  displayRewardPagination();

  await renderTransaction();
  if (app.networkId !== null) {
    await verifyCurrentNetwork(app);
  } else {
    throw new Error("Network ID is null");
  }
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
  const table = document.getElementsByTagName(`table`)[0];

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
  const table = document.getElementsByTagName(`table`)[0];
  table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  const additionalDetails = document.getElementById(`additionalDetails`) as HTMLElement;
  additionalDetails.addEventListener("click", () => {
    isDetailsVisible = !isDetailsVisible;
    table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  });
}
