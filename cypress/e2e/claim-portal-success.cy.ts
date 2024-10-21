/* eslint-disable sonarjs/no-duplicate-string */
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { Wallet } from "ethers";

const SENDER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil

describe("Claims Portal Success", () => {
  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    setupStubs();
    setupIntercepts();

    cy.visit(`/${claimUrl}`);
    cy.wait(2000);
  });
  describe("Success", () => {
    it("should successfully claim a permit", () => {
      cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

      cy.get('table[data-make-claim="ok"]').should("exist");

      cy.get("button[id='make-claim']").invoke("click");

      cy.get("#invalidator").should("not.be.visible");

      cy.get("#claim-loader").should("be.visible").as("loader");

      cy.wait(5000); // required for the action to complete

      cy.get("#view-claim").should("be.visible").and("include.text", "View Claim");

      // anvil confirms it instantly so there is two notifications
      cy.get("body", { timeout: 15000 }).should("contain.text", "Transaction sent");
      cy.get("body", { timeout: 15000 }).should("contain.text", "Claim Complete");

      cy.window().then((win) => {
        win.open = cy.stub().as("open");
      });

      const urlRegex = /https:\/\/[a-zA-Z0-9.-]+\/tx\/[a-zA-Z0-9]+/;
      cy.get("#view-claim")
        .invoke("click")
        .then(() => {
          cy.get("@open").should("be.calledWithMatch", urlRegex);
        });
    });
  });

  describe("Not meant for you", () => {
    it("should fail to claim a permit not for meant for them", () => {
      cy.visit(`/${notMeantForYouPermit}`).then(() => {
        cy.wait(2000);
      });
      cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

      cy.get('table[data-make-claim="ok"]').should("exist");

      cy.get("button[id='make-claim']").invoke("click");

      cy.get("#invalidator").should("not.be.visible");

      cy.get("#claim-loader").should("be.visible");

      cy.get("#view-claim").should("not.be.visible");

      cy.get("body", { timeout: 15000 }).should("contain.text", "This reward is not for you");
    });
  });

  describe("Invalidate nonce", () => {
    beforeEach(() => {
      setupStubs(1);
    });

    it("should successfully invalidate a nonce", () => {
      cy.visit(`/${notMeantForYouPermit}`).then(() => {
        cy.wait(2000);
      });
      cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

      cy.get('table[data-make-claim="ok"]').should("exist");

      cy.get("#invalidator").should("be.visible").invoke("click");

      cy.get("#claim-loader").should("not.be.visible");
      cy.get("#view-claim").should("not.be.visible");

      cy.get("body", { timeout: 15000 }).should("contain.text", "Nonce invalidation transaction sent");
    });
  });
});

function setupStubs(walletIndex = 0) {
  const provider = new JsonRpcProvider("http://localhost:8545");
  const signer = provider.getSigner(walletIndex);
  const wallet = new Wallet(SENDER_PRIVATE_KEY, provider);

  stubEthereum(signer);

  return { provider, signer, wallet };
}

function setupIntercepts() {
  cy.intercept("POST", "*", (req) => {
    // capturing the RPC optimization calls
    if (req.body.method === "eth_getBlockByNumber") {
      req.reply({
        statusCode: 200,
        body: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            number: "0x1",
          },
        },
      });
    } else {
      req.continue();
    }
  });

  cy.intercept("POST", "https://wfzpewmlyiozupulbuur.supabase.co/rest/v1/*", (req) => {
    req.reply({
      statusCode: 200,
      body: {},
    });
  });
  cy.intercept("PATCH", "https://wfzpewmlyiozupulbuur.supabase.co/rest/v1/*", (req) => {
    req.reply({
      statusCode: 200,
      body: {},
    });
  });
  cy.intercept("GET", "https://wfzpewmlyiozupulbuur.supabase.co/rest/v1/*", (req) => {
    req.reply({
      statusCode: 200,
      body: {
        data: [],
      },
    });
  });
}

function stubEthereum(signer: JsonRpcSigner) {
  const addr = signer._address;
  // Stubbing the ethereum object
  cy.on("window:before:load", (win) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((win as any).ethereum = {
      isMetaMask: true,
      enable: cy.stub().resolves([addr]),
      request: cy.stub().callsFake(async ({ method }) => providerFunctions(method, addr)),
      on: cy.stub().callsFake((event, cb) => {
        if (event === "accountsChanged") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (win as any).ethereum.onAccountsChanged = cb;
        }
      }),
      autoRefreshOnNetworkChange: false,
      chainId: "0x7a69",
      selectedAddress: addr,
      requestAccounts: cy.stub().resolves([addr]),
      send: cy.stub().callsFake(async ({ method }) => providerFunctions(method, addr)),
      getSigner: () => signer,
    }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((win as any).signer = signer);
  });
}

function providerFunctions(method: string, addr: string) {
  switch (method) {
    case "eth_requestAccounts":
      return [addr];
    case "wallet_sendDomainMetadata":
      return true;
    case "wallet_addEthereumChain":
      return true;
    case "wallet_switchEthereumChain":
      return true;
    case "wallet_watchAsset":
      return true;
    case "eth_chainId":
      return "0x7a69";
    case "eth_accounts":
      return [addr];
    case "eth_signTypedData_v4":
      return addr;
    case "eth_estimateGas":
      return "0x7a69";
  }
}

// placed here due to length
const claimUrl =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjEwODc2OTM3ODM4MTQ4OTY1NTIxMDM2ODQ4NzgzNzgzMDA2MDU0MjAwMzcxOTM0NTY0MzYzMjQ5MDIzMTQ1MTcyOTczMTgzNDgwMTM5MiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg4YWZmYWU1ZTA5YTkyN2QwYjUzNDQ1M2Y4NTE5ZWVlZDE5MzY5MTBkZWFhOGY5YTA0OTM1ODQzNDMzNDA5NmExMTg5ZmVkM2MxNzgyZmU0ZGI5ZTNhMDg2NWVkYjc3ZDczYzliMDliOTgxMTBmN2Q0ZWEyY2Y5ZDBhM2Q1YjhjYzFjIiwibmV0d29ya0lkIjozMTMzN30seyJ0eXBlIjoiZXJjMjAtcGVybWl0IiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4ZTkxRDE1M0UwYjQxNTE4QTJDZThEZDNENzk0NEZhODYzNDYzYTk3ZCIsImFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiI1NjQzNjc4ODI2MzUwOTQ3NTY2NzAwNzA4MDA5ODQ5MDM0MDE1OTExMzYxMjM5NTUyMTA3Mjk3NDkxNzcyNDA2Mzg0NDY2Mjc0NDEzMiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDhhZmZhZTVlMDlhOTI3ZDBiNTM0NDUzZjg1MTllZWVkMTkzNjkxMGRlYWE4ZjlhMDQ5MzU4NDM0MzM0MDk2YTExODlmZWQzYzE3ODJmZTRkYjllM2EwODY1ZWRiNzdkNzNjOWIwOWI5ODExMGY3ZDRlYTJjZjlkMGEzZDViOGNjMWMiLCJuZXR3b3JrSWQiOjMxMzM3fV0=";

const notMeantForYouPermit =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjkxOTk3MjEyMjMyMTcxMDcyMTI5OTIwODIzNjMwOTY3ODE5ODgwNTcyNjcyMTc2ODcwNjU4MzE2Nzk4MjUxNzU4OTQ2MzQ1NDY2OTA1IiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhiYTEyMjIyMjIyMjI4ZDhiYTQ0NTk1OGE3NWEwNzA0ZDU2NmJmMmM4IiwicmVxdWVzdGVkQW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDNiYzBjOTA5NzA1NmRhNmJkMzA4NmM4MGRiM2RmZDAzODNjNjgxN2FlZTAwMDExZDFlYTI3NzFkZWVlYjUxNjg1MWE3ZmYyY2UzNGUxNmI1ZjFkNTY1NGRmYzQ5MTk1YjQ4YmE5YmY1YmY0YTllMGRlOGY4ODc3YjBkMTY4NGRmMWMiLCJuZXR3b3JrSWQiOjMxMzM3fSx7InR5cGUiOiJlcmMyMC1wZXJtaXQiLCJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHhlOTFEMTUzRTBiNDE1MThBMkNlOERkM0Q3OTQ0RmE4NjM0NjNhOTdkIiwiYW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6Ijc3MDE3MDM2NzU4NzI2MzU5MTc4ODExMjM0Njk4NTMxMjE2NjYwODc4NzU0NjMwMDc4NzAzMDY4NzA4NzM3MDEzNTYxODIxMDQwODkwIiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhiYTEyMjIyMjIyMjI4ZDhiYTQ0NTk1OGE3NWEwNzA0ZDU2NmJmMmM4IiwicmVxdWVzdGVkQW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NzA5OTc5NzBDNTE4MTJkYzNBMDEwQzdkMDFiNTBlMGQxN2RjNzlDOCIsInNpZ25hdHVyZSI6IjB4M2JjMGM5MDk3MDU2ZGE2YmQzMDg2YzgwZGIzZGZkMDM4M2M2ODE3YWVlMDAwMTFkMWVhMjc3MWRlZWViNTE2ODUxYTdmZjJjZTM0ZTE2YjVmMWQ1NjU0ZGZjNDkxOTViNDhiYTliZjViZjRhOWUwZGU4Zjg4NzdiMGQxNjg0ZGYxYyIsIm5ldHdvcmtJZCI6MzEzMzd9XQ==";
