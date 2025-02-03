import { createClient } from "@supabase/supabase-js";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function gitHubLoginButtonHandler(scopes = "public_repo read:org") {
  const redirectTo = window.location.href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      scopes,
      redirectTo,
    },
  });
  if (error) {
    console.log(error);
    // renderErrorInModal(error, "Error logging in");
  }
}

async function checkSupabaseSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

const augmentAccessButton = document.createElement("button");
export function renderAugmentAccessButton() {
  augmentAccessButton.id = "augment-access-button";
  augmentAccessButton.innerHTML = `<span title="Allow access to private repositories"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m0 12H6V10h12z"></path></svg><span/>`;
  augmentAccessButton.addEventListener("click", () => gitHubLoginButtonHandler("repo read:org"));
  return augmentAccessButton;
}

const gitHubLoginButton = document.createElement("button");
export const authenticationElement = document.getElementById("authentication") as HTMLDivElement;
export function renderGitHubLoginButton() {
  gitHubLoginButton.id = "github-login-button";
  gitHubLoginButton.innerHTML = "<span>Login</span><span class='full'>&nbsp;With GitHub</span>";
  gitHubLoginButton.addEventListener("click", () => gitHubLoginButtonHandler());
  if (authenticationElement) {
    authenticationElement.appendChild(gitHubLoginButton);
    authenticationElement.classList.add("ready");
  }
}

export async function getGitHubAccessToken(): Promise<string | null> {
  // better to use official function, looking up localstorage has flaws
  const oauthToken = await checkSupabaseSession();

  const expiresAt = oauthToken?.expires_at;
  if (expiresAt) {
    if (expiresAt < Date.now() / 1000) {
      localStorage.removeItem(`sb-${"SUPABASE_STORAGE_KEY"}-auth-token`);
      return null;
    }
  }

  const accessToken = oauthToken?.provider_token;
  if (accessToken) {
    return accessToken;
  }

  return null;
}
