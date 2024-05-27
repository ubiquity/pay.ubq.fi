/* eslint-disable sonarjs/no-duplicate-string */
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { Wallet } from "ethers";
import { PermitConfig, generateERC20Permit } from "../../scripts/typescript/generate-erc20-permit-url";

const beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // anvil
const SENDER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil

describe("Gift Cards", () => {
  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    setupStubs();

    setupIntercepts();
  });

  it("should show/hide activation info", () => {
    const permitConfig = Cypress.env("permitConfig");
    void cy.getPermitUrl(permitConfig).then((permitUrl) => {
      cy.visit(`${permitUrl as string}`);
      cy.wait(2000);

      cy.wait("@listGiftCards");

      cy.get("#gift-cards").should("exist").and("include.text", "Or claim in virtual visa/mastercard");
      cy.get(".gift-card").should("have.length.above", 0);

      cy.get(".gift-card.purchased").should("not.exist");

      cy.get('#activate-info .redeem-info-wrapper[data-show="true"]').should("not.exist");
      cy.get(".gift-card").eq(0).find(".activate-btn").invoke("click");

      cy.get('#activate-info .redeem-info-wrapper[data-show="true"]').should("exist");
      cy.get("#activate-info .close-btn").invoke("click");
      cy.get('#activate-info .redeem-info-wrapper[data-show="true"]').should("not.exist");
    });
  });

  it("should claim a gift card", () => {
    const permitConfig = Cypress.env("permitConfig");

    const customPermitConfig = { ...permitConfig, AMOUNT_IN_ETH: "30.0" };

    void cy.getPermitUrl(customPermitConfig).then((permitUrl) => {
      cy.visit(permitUrl);
      cy.wait(2000);

      cy.wait("@listGiftCards");
      cy.get(".gift-card").should("have.length.above", 0);
      cy.get(".gift-card .available").should("have.length.above", 0);
      cy.get(".gift-card .available")
        .eq(0)
        .parent()
        .parent()
        .find("h3")
        .eq(0)
        .then(($name) => {
          const giftCardName = $name;
          cy.wrap(giftCardName).as("giftCardName");
        });

      cy.intercept({ method: "POST", url: "/post-order" }).as("postOrder");

      cy.get(".gift-card .available").eq(0).parent().parent().find(".claim-gift-card-btn").should("have.length", 1);

      cy.intercept({ method: "GET", url: "/get-order**" }).as("getOrder");
      cy.get(".gift-card .available").eq(0).parent().parent().find(".claim-gift-card-btn").invoke("click");
      cy.get(".notifications", { timeout: 10000 }).should("contain.text", "Processing... Please wait. Do not close this page.");
      cy.get(".notifications", { timeout: 10000 }).should("contain.text", "Success. Refresh this page in a few minutes to get your card.");
      cy.wait("@getOrder", { timeout: 10000 });

      cy.get("#gift-cards").should("exist").and("include.text", "Your gift card");

      cy.get("@giftCardName").then((name) => {
        cy.get(".gift-card h3")
          .eq(0)
          .should("have.text", name.text() as string);
      });
    });
  });

  it("should reveal a redeem code after claim", () => {
    cy.visit(
      "http://localhost:8080/?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIzMDAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjczMDU2NzU0MjU1ODU4ODMxMzQ0NTMzNDgxMDc0Njg5NTE1ODEyNzIzNDE5NTkwNjMwOTY2MTUwOTIxNzk3ODEzMzExMDE4NjgyMDMzIiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhmMzlGZDZlNTFhYWQ4OEY2RjRjZTZhQjg4MjcyNzljZmZGYjkyMjY2IiwicmVxdWVzdGVkQW1vdW50IjoiMzAwMDAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDdkYWYxMTNhNTA0ZjYxYzk5MDg0ZGM2ZGFlZTZkZDFkZjhhM2I4YjM5ZTU0N2VkYWIxMjNhNzQxNjBhNWVhNDYwZDgyODdmYWM1MDlhYTc5M2ZhNjc5M2RlOTg5YmVhOTg4Y2M3NDAyNGE5ZmQyNjAyMjY2YTQzZjg1MDlhYTJkMWIiLCJuZXR3b3JrSWQiOjMxMzM3fSx7InR5cGUiOiJlcmMyMC1wZXJtaXQiLCJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHhlOTFEMTUzRTBiNDE1MThBMkNlOERkM0Q3OTQ0RmE4NjM0NjNhOTdkIiwiYW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjYyOTc2MjY4MDU3NjQ1MTA0ODc3MTI4NDU3MTU1NDgwNTU5NzU1OTQwMjA4MzExMDQ3Mjc1Njc2NjAyNDI3NzQwODY1NzE0MDkxMzAwIiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhmMzlGZDZlNTFhYWQ4OEY2RjRjZTZhQjg4MjcyNzljZmZGYjkyMjY2IiwicmVxdWVzdGVkQW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NzA5OTc5NzBDNTE4MTJkYzNBMDEwQzdkMDFiNTBlMGQxN2RjNzlDOCIsInNpZ25hdHVyZSI6IjB4N2RhZjExM2E1MDRmNjFjOTkwODRkYzZkYWVlNmRkMWRmOGEzYjhiMzllNTQ3ZWRhYjEyM2E3NDE2MGE1ZWE0NjBkODI4N2ZhYzUwOWFhNzkzZmE2NzkzZGU5ODliZWE5ODhjYzc0MDI0YTlmZDI2MDIyNjZhNDNmODUwOWFhMmQxYiIsIm5ldHdvcmtJZCI6MzEzMzd9XQ=="
    );
    cy.wait(2000);

    cy.wait("@listGiftCards");

    cy.get("#gift-cards").should("exist").and("include.text", "Your gift card");
    cy.get(".gift-card.redeem-code > h3").eq(0).should("have.text", "Your redeem code");
    cy.get(".gift-card.redeem-code > p").eq(0).should("have.text", "xxxxxxxxxxxx");
    cy.get(".gift-card.redeem-code > p").eq(1).should("have.text", "xxxxxxxxxxxx");
    cy.get(".gift-card.redeem-code > p").eq(2).should("have.text", "xxxxxxxxxxxx");
    cy.get(".gift-card.redeem-code > .buttons > #reveal-btn").invoke("click");

    cy.get(".gift-card.redeem-code > h3").eq(0).should("have.text", "Your redeem code");
    cy.get(".gift-card.redeem-code > p").should("exist");
    cy.get(".gift-card.redeem-code > p").eq(0).should("not.have.text", "xxxxxxxxxxxx");
  });
});

function setupStubs() {
  const provider = new JsonRpcProvider("http://localhost:8545");
  const signer = provider.getSigner(beneficiary);
  const wallet = new Wallet(SENDER_PRIVATE_KEY, provider);

  signer.signMessage = cy.stub().callsFake(async () => {
    return "0x4d9f92f69898fd112748ff04c98e294cced4dbde80ac3cba42fb546538bf54ca0e3fbc3f94416813f8da58a4b26957b62bae66c48bf01ca1068af0f222bf18df1c";
  });
  stubEthereum(signer);

  return { provider, signer, wallet };
}

function setupIntercepts() {
  cy.intercept("POST", "*", (req) => {
    // capturing the RPC optimization calls
    if (req.body.method === "eth_getBlockByNumber") {
      req.reply({
        statusCode: 200,
        body: cy.fixture("eth_getBlockByNumber.json"),
      });
    }
  });

  cy.intercept("POST", "https://wfzpewmlyiozupulbuur.supabase.co/rest/v1/*", {
    statusCode: 200,
    body: {},
  });
  cy.intercept("PATCH", "https://wfzpewmlyiozupulbuur.supabase.co/rest/v1/*", {
    statusCode: 200,
    body: {},
  });
  cy.intercept("GET", "https://wfzpewmlyiozupulbuur.supabase.co/rest/v1/*", {
    statusCode: 200,
    body: {},
  });

  cy.intercept({ method: "GET", url: "/list-gift-cards" }).as("listGiftCards");
}

function stubEthereum(signer: JsonRpcSigner) {
  // Stubbing the ethereum object
  cy.on("window:before:load", (win) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((win as any).ethereum = {
      isMetaMask: true,
      enable: cy.stub().resolves(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
      request: cy.stub().callsFake(async (method) => providerFunctions(method)),
      on: cy.stub().callsFake((event, cb) => {
        if (event === "accountsChanged") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (win as any).ethereum.onAccountsChanged = cb;
        }
      }),
      autoRefreshOnNetworkChange: false,
      chainId: "0x7a69",
      selectedAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      requestAccounts: cy.stub().resolves(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
      send: cy.stub().callsFake(async (method) => providerFunctions(method)),
      getSigner: () => signer,
    }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((win as any).signer = signer);
  });
}

function providerFunctions(method: string) {
  switch (method) {
    case "eth_requestAccounts":
      return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
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
      return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
    case "eth_signTypedData_v4":
      return "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    case "eth_estimateGas":
      return "0x7a69";
  }
}

Cypress.Commands.add("getPermitUrl", (customPermitConfig: PermitConfig) => {
  return generateERC20Permit(customPermitConfig);
});
