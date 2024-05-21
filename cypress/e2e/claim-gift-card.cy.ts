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
    cy.intercept({ method: "GET", url: "/list-gift-cards" }).as("listGiftCards");

    const permitConfig = Cypress.env("permitConfig");
    void cy.getPermitUrl(permitConfig).then((permitUrl) => {
      cy.visit(`${permitUrl as string}`);

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
    // 9 WXDAI permit
    // Reloadly sandbox has auto recharge when balance falls below 10USD
    // so reloadly balance should not be below 10$
    const customPermitConfig = { ...permitConfig, AMOUNT_IN_ETH: "9.0" };

    void cy.getPermitUrl(customPermitConfig).then((customPermitUrl) => {
      //        console.log("permitUrl", customPermitUrl);
      cy.intercept({ method: "GET", url: "/list-gift-cards" }).as("listGiftCards");

      cy.visit(customPermitUrl);
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
      cy.get(".gift-card .available").eq(0).parent().parent().find(".claim-gift-card-btn").invoke("click");

      cy.wait("@postOrder", { timeout: 10000 });

      cy.get("#gift-cards").should("exist").and("include.text", "Your gift card");

      cy.get("@giftCardName").then((name) => {
        cy.get(".gift-card h3")
          .eq(0)
          .should("have.text", name.text() as string);
      });
    });
  });

  it("should reveal a redeem code after claim", () => {
    cy.intercept({ method: "GET", url: "/list-gift-cards" }).as("listGiftCards");
    cy.visit(
      "http://localhost:8080/?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIyMzE2MDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjY4MDM3MTQ4MTA2MjkyODM2MDY5NDA4MDUxNjgwODY0NDc1MjcxMDE0MjY4Njc3NzI0NTQ5MzM4ODkxMTU4NDI1MjY5NjY4NzU3ODI0IiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhmMzlGZDZlNTFhYWQ4OEY2RjRjZTZhQjg4MjcyNzljZmZGYjkyMjY2IiwicmVxdWVzdGVkQW1vdW50IjoiMjMxNjAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDkzNzdiMTczNjE5OTAwNDU2YzYxZDY3NTEzNGM2MTEyOGY1N2VmOTU5YjhmZTQ5NmUyMjYyYzEwMTY2Mjk5NGQzYWE2YzRlZDgyODQ0ZjQwY2M2NzQxZTcwMGYxMTkxZjViNGRlN2VhZGJlN2ZhMWU4ZGE4MzNjY2Y4MTA1YTM1MWIiLCJuZXR3b3JrSWQiOjMxMzM3fSx7InR5cGUiOiJlcmMyMC1wZXJtaXQiLCJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHhlOTFEMTUzRTBiNDE1MThBMkNlOERkM0Q3OTQ0RmE4NjM0NjNhOTdkIiwiYW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6Ijg3NDA5NDg3MzUyMzAwMzgyODA3NTYwODM1MDEwODI1ODk4MDY0OTk1MzA1OTk3NTM2Mzg2NDE0NDQ3NTQ2MjQ5NDc3ODE0NjY3Nzk1IiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhmMzlGZDZlNTFhYWQ4OEY2RjRjZTZhQjg4MjcyNzljZmZGYjkyMjY2IiwicmVxdWVzdGVkQW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NzA5OTc5NzBDNTE4MTJkYzNBMDEwQzdkMDFiNTBlMGQxN2RjNzlDOCIsInNpZ25hdHVyZSI6IjB4OTM3N2IxNzM2MTk5MDA0NTZjNjFkNjc1MTM0YzYxMTI4ZjU3ZWY5NTliOGZlNDk2ZTIyNjJjMTAxNjYyOTk0ZDNhYTZjNGVkODI4NDRmNDBjYzY3NDFlNzAwZjExOTFmNWI0ZGU3ZWFkYmU3ZmExZThkYTgzM2NjZjgxMDVhMzUxYiIsIm5ldHdvcmtJZCI6MzEzMzd9XQ=="
    );

    cy.wait("@listGiftCards");
    cy.get(".gift-card").should("have.length", 0);

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
  const provider = new JsonRpcProvider("http://localhost:8545", 31337);
  const signer = provider.getSigner(beneficiary);
  const wallet = new Wallet(SENDER_PRIVATE_KEY, provider);

  signer.signMessage = cy.stub().callsFake(async () => {
    return "0x824d8532d8b96dd4bed592bbb58eb090f23fabfe3e27e017c0b9a378667b3eca2a3fd2449362d18001eaca07dd8f77feadb7ddbafe35ba49704941c8c6af6c061b";
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
