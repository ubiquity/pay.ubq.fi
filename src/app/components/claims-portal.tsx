"use client";
import React from "react";
import { CommitHashDisplay } from "./commit-hash";
import { Icon } from "./icons";
import { GridBackground } from "./grid";
import { app } from "../scripts/rewards/app-state";
import { readClaimDataFromUrl } from "../scripts/rewards/render-transaction/read-claim-data-from-url";
import { claimErc20PermitHandlerWrapper } from "../scripts/rewards/web3/erc20-permit";
import { viewClaimHandler } from "../scripts/rewards/render-transaction/render-transaction";

async function readClaimData() {
  await readClaimDataFromUrl(app);
}

export default function ClaimsPortal({ permits }: { permits?: string }) {
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
                    <button id="make-claim" onClick={() => claimErc20PermitHandlerWrapper(app)}>
                      <div className="claim-title">Collect</div>
                      <Icon name="makeClaim" className="claim-title" />
                    </button>

                    <button id="view-claim" onClick={() => viewClaimHandler(app)}>
                      <div className="claim-title">View Claim</div>
                      <Icon name="viewClaim" />
                    </button>

                    <button id="invalidator">
                      <div>Void</div>
                      <Icon name="invalidator" />
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
