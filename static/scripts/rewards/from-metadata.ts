import { createClient } from "@supabase/supabase-js";
import { AppState } from "./app-state";
import { getGitHubAccessToken, renderGitHubLoginButton } from "../shared/auth/github";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function readClaimDataFromMetadata(app: AppState) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const accessToken = await getGitHubAccessToken();
  if (!accessToken) {
    // import the "login with github" button from work.ubq.fi
    renderGitHubLoginButton();
  }

  let githubId;
  if (user?.identities) {
    githubId = user?.identities[0].id;
  } else {
    return;
  }

  // Using our metadata system we can easily GraphQL query for permits.
  const permits = (await supabase.from("permits").select("*").eq("beneficiary_id", githubId)).data;

  // GraphQL query with authentication for private repos.
  if (!permits || !permits.length) {
    return false;
  }

  const userData = (await supabase.from("users").select("*").eq("id", githubId)).data;
  if (!userData) return;
  const walletData = (await supabase.from("wallets").select("*").eq("id", userData[0]['wallet_id'])).data;
  if (!walletData) return;
  app.claims.push(...(permits.map(permit => {
    return {
      ...permit,
      beneficiary: walletData[0].address,
      networkId: 31337,
      // TODO
      owner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      // TODO
      tokenAddres: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
      tokenType: "ERC20"
    } 
  })));

  // limit to previous 100 results or whatever is the max that GraphQL can return in a single shot
  // check if they have already been claimed, if so, discard
  // if unclaimed permits are found, import into the UI (we should already support multiple permits to be loaded in the UI)
}
