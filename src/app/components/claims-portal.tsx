"use client";
import React, { useEffect } from "react";
import { CommitHashDisplay } from "./commit-hash";
import { Icon } from "./icons";
import { claimErc20PermitHandler } from "../scripts/rewards/web3/erc20-permit";
import { GridBackground } from "./grid";
import { app } from "../scripts/rewards/app-state";
import { readClaimDataFromUrl } from "../scripts/rewards/render-transaction/read-claim-data-from-url";
import { WebAuthnHandler } from "../scripts/rewards/account-abstraction/webauthn";
import { githubLoginHandler } from "../scripts/rewards/account-abstraction/github-login-button";
import { getButtonController, toaster } from "../scripts/rewards/toaster";
import { User } from "@supabase/supabase-js";
import { SupabaseBrowserClient } from "../scripts/rewards/account-abstraction/supabase-browser-client";
import { renderTransaction } from "../scripts/rewards/render-transaction/render-transaction";

async function readClaimData() {
  await readClaimDataFromUrl(app);
}

export default function ClaimsPortal({ permits, supabaseUser }: { permits?: string; supabaseUser?: User | null }) {
  const webAuthnHandler = new WebAuthnHandler();
  const [isMounted, setMounted] = React.useState(false);
  const isLoggedIn = React.useMemo(() => !!supabaseUser, [supabaseUser]);

  useEffect(() => {
    async function load() {
      if (!isLoggedIn && permits) {
        await SupabaseBrowserClient.getInstance().loginWithGitHub(permits);
        return;
      }
      await readClaimData();

      if (app.claims.length === 0 || !permits) {
        return;
      }

      if (supabaseUser && !isMounted) {
        // use this to create or authenticate with webauthn
        const dataForWebAuthnCredential = {
          id: new TextEncoder().encode(supabaseUser.email),
          name: supabaseUser.user_metadata.preferred_username,
          displayName: supabaseUser.user_metadata.preferred_username,
        };

        // we'll create an EOA for the user and then attach it to the SMA
        if (!window.ethereum) {
          app.signer = await webAuthnHandler.handleUserAuthentication(supabaseUser, dataForWebAuthnCredential, app);

          if (app.signer.account?.address) {
            toaster.create("success", `Successfully authenticated with WebAuthn. Welcome back ${supabaseUser.user_metadata.preferred_username}!`);
          } else {
            toaster.create("warning", "Failed to authenticate with WebAuthn. Please try again.");
          }
        } else {
          // just saves their EOA to supabase for future use
          // webauthn doesn't make sense here unless using it to either
          // - create them an EOA like above then we can reproduce the private key to sign txs with
          // - embed their current EOA private key in the webauthn credential (not recommended)

          app.signer = await webAuthnHandler.registerEOA(supabaseUser, dataForWebAuthnCredential, app);
        }
      }

      const toasterEle = document.getElementsByClassName("toast .fa-circle-check success");

      await app.signer.getPermissions();

      const [address] = (await app.signer.getAddresses()) || [];

      if (!toasterEle.length && address) {
        toaster.create("success", `Connected to ${address}!`);
        await renderTransaction();
        getButtonController().showMakeClaim();
      }
    }
    load().catch(console.error);
    setMounted(true);
  }, []);

  return (
    <>
      <div id="background">
        <div className="gradient"></div>
        <div className="gradient"></div>
        <GridBackground />
      </div>
      <main>
        <header>
          <a href="https://ubq.fi/">
            <div id="logo">
              <div id="logo-icon">
                <Icon name="logoIcon" />
              </div>
              <div id="logo-text">
                <span>Ubiquity</span>
                <span>Rewards</span>
              </div>
            </div>
          </a>
        </header>

        <div>
          <table data-details-visible="false" data-make-claim-rendered="false" data-contract-loaded="false" data-make-claim="error">
            <thead>
              <tr>
                <th>
                  <div>Notice</div>
                </th>
                <td>
                  <div className="loading-message">Loading</div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr id="Amount">
                <th>
                  <div>Amount</div>
                </th>
                <td id="rewardAmount">
                  <div className="loading-message">Loading</div>
                </td>
              </tr>
              <tr id="Token">
                <th>
                  <div>Token</div>
                </th>
                <td id="rewardToken">
                  <span className="full">
                    <div></div>
                  </span>
                  <span className="short">
                    <div className="loading-message">Loading</div>
                  </span>
                </td>
              </tr>
              <tr id="To">
                <th>
                  <div>For</div>
                </th>
                <td id="rewardRecipient">
                  <span className="full">
                    <div></div>
                  </span>
                  <span className="short">
                    <div className="loading-message">Loading</div>
                  </span>
                  <span className="ens">
                    <div></div>
                  </span>
                </td>
              </tr>
              <tr id="additional-details-border">
                <th>
                  <div>
                    <button id="additionalDetails">
                      <div>Details</div>
                      <Icon name="closer" className="closer" />
                      <Icon name="opener" className="opener" />
                    </button>
                  </div>
                </th>
                <td>
                  <div id="controls" data-loader="false" data-make-claim="false" data-view-claim="false" data-github-sign-in="false">
                    <button id="claim-loader">
                      <Icon name="claimLoader" />
                      <div id="claiming-message">Claiming</div>
                    </button>
                    <button id="make-claim" onClick={() => claimErc20PermitHandler(app)}>
                      <div className="claim-title">Collect</div>
                      <Icon name="makeClaim" className="claim-title" />
                    </button>

                    <button id="view-claim">
                      <div className="claim-title">View Claim</div>
                      <Icon name="viewClaim" />
                    </button>

                    <button id="invalidator">
                      <div>Void</div>
                      <Icon name="invalidator" />
                    </button>

                    <button onClick={githubLoginHandler} id="github-sign-in">
                      <div>Sign In</div>
                      <Icon name="github" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
            <tbody id="additionalDetailsTable"></tbody>
          </table>
        </div>
        <footer>
          <figure id="carousel">
            <div id="prevTx"></div>
            <div id="rewardsCount"></div>
            <div id="nextTx"></div>
          </figure>
          <CommitHashDisplay />
        </footer>
      </main>
      <ul className="notifications"></ul>
    </>
  );
}
