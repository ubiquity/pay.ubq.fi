import { getLocalStore, setLocalStore } from "./local-store";
import { supabase } from "./render-transaction/supabase-getters";

export const GITHUB_ACCEPT_HEADER = "application/vnd.github+json";

export interface OAuthToken {
  provider_token: string;
  access_token: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface UserMetadata {
  avatar_url: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  iss: string;
  name: string;
  phone_verified: boolean;
  preferred_username: string;
  provider_id: string;
  sub: string;
  user_name: string;
}

export interface Identity {
  id: string;
  user_id: string;
  identity_data: {
    avatar_url: string;
    email: string;
    email_verified: boolean;
    full_name: string;
    iss: string;
    name: string;
    phone_verified: boolean;
    preferred_username: string;
    provider_id: string;
    sub: string;
    user_name: string;
  };
  provider: string;
  last_sign_in_at: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at: string;
  phone: string;
  confirmed_at: string;
  last_sign_in_at: string;
  app_metadata: { provider: string; providers: string[] };
  user_metadata: UserMetadata;
  identities: Array<Identity>;
  created_at: string;
  updated_at: string;
}

/**
 * Handles GitHub login button click
 * Initiates OAuth flow with required scopes
 */
export async function gitHubLoginButtonHandler() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.href,
      // Request minimum required scope:
      // - public_repo to create public repositories
      scopes: "public_repo",
    },
  });
  if (error) {
    console.error("Error logging in:", error);
  }
}

/**
 * Gets session token from either:
 * 1. URL hash after OAuth redirect
 * 2. Cached session in local storage
 */
export function getSessionToken() {
  // cSpell: ignore wfzpewmlyiozupulbuur
  const cachedSessionToken = getLocalStore<OAuthToken>("sb-wfzpewmlyiozupulbuur-auth-token");
  if (cachedSessionToken) {
    return cachedSessionToken.provider_token;
  }
  const newSessionToken = getNewSessionToken();
  if (newSessionToken) {
    return newSessionToken;
  }
  return null;
}

function getNewSessionToken() {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.substring(1)); // remove the '#' and parse
  const providerToken = params.get("provider_token");
  if (!providerToken) {
    return null;
  }
  setLocalStore("sb-wfzpewmlyiozupulbuur-auth-token", {
    provider_token: providerToken,
  });
  return providerToken;
}

export function initializeAuth() {
  const token = getSessionToken();
  const loginButton = document.getElementById("github-login") as HTMLDivElement;
  const gitHubLoginButton = document.getElementById("github-login-button") as HTMLButtonElement;

  // Add click handler to the button
  gitHubLoginButton.addEventListener("click", gitHubLoginButtonHandler);

  // Show login button if not authenticated
  if (!token) {
    loginButton.classList.remove("invisible");
  } else {
    loginButton.classList.add("invisible");
  }
}
