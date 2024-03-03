import { Value } from "@sinclair/typebox/value";
import { AppState, app } from "../app-state";
import { useFastestRpc } from "../rpc-optimization/get-optimal-provider";
import { connectWallet } from "../web3/connect-wallet";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { claimRewardsPagination } from "./claim-rewards-pagination";
import { renderTransaction } from "./render-transaction";
import { setClaimMessage } from "./set-claim-message";
import { RewardPermit, claimTxT } from "./tx-type";
import { Type } from "@sinclair/typebox";

export const table = document.getElementsByTagName(`table`)[0];
const urlParams = new URLSearchParams(window.location.search);
const base64encodedTxData = urlParams.get("claim");

export async function readClaimDataFromUrl(app: AppState) {
  if (!base64encodedTxData) {
    // No claim data found
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-claim`, "error");
    return;
  }

  app.claims = decodeClaimData(base64encodedTxData).flat();
  app.provider = await useFastestRpc(app);
  const networkId = app.reward?.networkId || app.networkId;
  app.signer = await connectWallet().catch(console.error);
  displayRewardDetails();
  displayRewardPagination();

  renderTransaction(app)
    .then(() => verifyCurrentNetwork(networkId as number))
    .catch(console.error);
}

function decodeClaimData(base64encodedTxData: string): RewardPermit[] {
  let permit;

  try {
    permit = JSON.parse(atob(base64encodedTxData));
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `1. Invalid claim data passed in URL` });
    table.setAttribute(`data-claim`, "error");
    throw error;
  }
  try {
    return [Value.Decode(Type.Array(claimTxT), permit)];
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `2. Invalid claim data passed in URL` });
    table.setAttribute(`data-claim`, "error");
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
