import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "../app-state";
import { useFastestRpc } from "../rpc-optimization/get-optimal-provider";
import { buttonController, toaster } from "../toaster";
import { connectWallet } from "../web3/connect-wallet";
import { checkRenderInvalidatePermitAdminControl, checkRenderMakeClaimControl } from "../web3/erc20-permit";
import { verifyCurrentNetwork } from "../web3/verify-current-network";
import { renderTransactions } from "./render-transaction";
import { setClaimMessage } from "./set-claim-message";
import { RewardPermit, claimTxT } from "./tx-type";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const urlParams = new URLSearchParams(window.location.search);
const base64encodedTxData = urlParams.get("claim");

function setError() {
  document.getElementById("table-target")?.childNodes.forEach((node) => (node as HTMLTableElement).setAttribute(`data-make-claim`, "error"));
}

export async function readClaimDataFromUrl(app: AppState) {
  if (!base64encodedTxData) {
    // No claim data found
    setClaimMessage({ type: "Notice", message: `No claim data found.` });
    setError();
    return;
  }

  app.claims = decodeClaimData(base64encodedTxData).flat();
  app.claimTxs = await getClaimedTxs(app);
  try {
    app.provider = await useFastestRpc(app);
  } catch (e) {
    toaster.create("error", `${e}`);
  }
  if (window.ethereum) {
    try {
      app.signer = await connectWallet();
    } catch (error) {
      /* empty */
    }
    window.ethereum.on("accountsChanged", () => {
      checkRenderMakeClaimControl(app).catch(console.error);
      checkRenderInvalidatePermitAdminControl(app).catch(console.error);
    });
  } else {
    buttonController.hideAll();
    toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
  }

  await renderTransactions(async (claim) => {
    if (claim.networkId !== null) {
      await verifyCurrentNetwork(claim.networkId);
    } else {
      throw new Error("Network ID is null");
    }
  });
}

async function getClaimedTxs(app: AppState): Promise<Record<string, string>> {
  const txs: Record<string, string> = Object.create(null);
  for (const claim of app.claims) {
    const { data } = await supabase.from("permits").select("transaction").eq("nonce", claim.permit.nonce.toString());

    if (data?.length == 1 && data[0].transaction !== null) {
      txs[claim.permit.nonce.toString()] = data[0].transaction as string;
    }
  }
  return txs;
}

function decodeClaimData(base64encodedTxData: string): RewardPermit[] {
  let permit;

  try {
    permit = JSON.parse(atob(base64encodedTxData));
    return [Value.Decode(Type.Array(claimTxT), permit)];
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL` });
    setError();
    throw error;
  }
}
