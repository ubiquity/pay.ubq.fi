import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { app } from "../app-state";
import { getOptimalProvider } from "../rpc-optimization/getOptimalProvider";
import { claimRewardsPagination } from "./claimRewardsPagination";
import { renderTransaction } from "./renderTransaction";
import { setClaimMessage } from "./set-claim-message";
import { claimTxT } from "./tx-type";

export const table = document.getElementsByTagName(`table`)[0];
const urlParams = new URLSearchParams(window.location.search);
const base64encodedTxData = urlParams.get("claim");

export async function readClaimDataFromUrl() {
  if (!base64encodedTxData) {
    // No claim data found
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-claim`, "none");
    return;
  }

  decodeClaimData(base64encodedTxData);

  await getOptimalProvider(app);

  displayRewardDetails();
  displayRewardPagination();

  renderTransaction(true)
    // .then(() => verifyCurrentNetwork(app.transaction?.networkId || app.networkId)) // @todo: verifyCurrentNetwork
    .catch(console.error);
}

function decodeClaimData(base64encodedTxData: string) {
  try {
    const claimTxs = Value.Decode(Type.Array(claimTxT), JSON.parse(atob(base64encodedTxData)));
    app.claims = claimTxs;
    app.networkId = app.claims[0].networkId;
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL` });
    table.setAttribute(`data-claim`, "error");
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
