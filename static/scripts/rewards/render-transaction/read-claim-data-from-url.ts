import { createClient } from "@supabase/supabase-js";
import { decodePermits } from "@ubiquibot/permit-generation/handlers";
import { Permit } from "@ubiquibot/permit-generation/types";
import { app, AppState } from "../app-state";
import { buttonControllers, toaster } from "../toaster";
import { checkRenderInvalidatePermitAdminControl, checkRenderMakeClaimControl, createInvalidatorActions } from "../web3/erc20-permit";
import { setClaimMessage } from "./set-claim-message";
import { useRpcHandler } from "../web3/use-rpc-handler";
import { renderTransaction } from "./render-transaction";
import { ButtonController } from "../button-controller";
import { connectWallet } from "../web3/connect-wallet";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const table = document.getElementsByTagName(`table`)[0];
const urlParams = new URLSearchParams(window.location.search);
const base64encodedTxData = urlParams.get("claim");

export async function readClaimDataFromUrl(app: AppState) {
  if (!base64encodedTxData) {
    // No claim data found
    // A single table shows the error message
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    table.setAttribute(`data-make-claim`, "error");
    return;
  }

  app.claims = decodeClaimData(base64encodedTxData);
  app.claimTxs = await getClaimedTxs(app);

  try {
    app.provider = await useRpcHandler(app.claims[0]);
  } catch (e) {
    if (e instanceof Error) {
      toaster.create("error", e.message);
    } else {
      toaster.create("error", JSON.stringify(e));
    }
  }

  try {
    app.signer = await connectWallet(app.claims[0].networkId);
  } catch (error) {
    /* empty */
  }

  try {
    // this would throw on mobile browsers & non-web3 browsers
    window?.ethereum.on("accountsChanged", () => {
      checkRenderMakeClaimControl(app).catch(console.error);
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    });
  } catch (err) {
    /*
     * handled feedback upstream already
     * buttons are hidden and non-web3 infinite toast exists
     */
  }

  await displayRewardsWithDetails();
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

function displayRewardDetails(table: Element) {
  let isDetailsVisible = false;
  table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  const additionalDetails = table.querySelector(`.additional-details`) as HTMLElement;
  additionalDetails.addEventListener("click", () => {
    isDetailsVisible = !isDetailsVisible;
    table.setAttribute(`data-details-visible`, isDetailsVisible.toString());
  });
}

/**
 * @summary Create a separate table element for each claim
 */
async function displayRewardsWithDetails() {
  const tableEl = document.getElementsByTagName("table")[0];
  if (!tableEl) return;
  tableEl.id = app.claims[0].nonce;
  const controls = tableEl.querySelector(".controls") as HTMLDivElement;
  const buttonController = new ButtonController(controls);
  buttonControllers[app.claims[0].nonce] = buttonController;

  await Promise.all(
    app.claims.slice(1).map(async (claim) => {
      // Create a new copy of the table
      const newTable = tableEl.cloneNode(true) as Element;
      newTable.id = claim.nonce;
      tableEl.parentElement?.appendChild(newTable);

      const controls = newTable.querySelector(".controls") as HTMLDivElement;
      const buttonController = new ButtonController(controls);
      buttonControllers[claim.nonce] = buttonController;
      await renderTransaction(claim, newTable);
      displayRewardDetails(newTable);
    })
  );

  // The first claim's table is populated last
  await renderTransaction(app.claims[0], tableEl);
  displayRewardDetails(tableEl);
  createInvalidatorActions();
}
