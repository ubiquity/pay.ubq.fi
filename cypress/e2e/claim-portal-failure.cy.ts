/* eslint-disable sonarjs/no-duplicate-string */
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";

const beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("Claims Portal Failures", () => {
  describe("No connection to wallet provider", () => {
    beforeEach(() => {
      cy.clearAllCookies();
      cy.clearAllLocalStorage();
      cy.clearAllSessionStorage();

      setupIntercepts();
      stubEthereum(beneficiary);

      cy.visit(`/${claimUrl}`);
      cy.wait(2000);
    });

    it("should handle no connected signer", () => {
      cy.get(".additional-details", { timeout: 15000 }).first().should("be.visible").invoke("click");

      cy.get("button.make-claim").first().should("be.visible").click();
      cy.get(".invalidator").should("not.be.visible");
      cy.get(".claim-loader").should("not.be.visible");
      cy.get(".view-claim").should("not.be.visible").and("include.text", "View Claim");

      cy.get("body").should("contain.text", "Please connect your wallet to claim this reward.");
    });
  });

  describe("Failed transactions", () => {
    const provider = new JsonRpcProvider("http://127.0.0.1:8545");
    const signer = provider.getSigner();

    beforeEach(() => {
      cy.clearAllCookies();
      cy.clearAllLocalStorage();
      cy.clearAllSessionStorage();

      setupIntercepts();
      stubEthereum(beneficiary, signer);

      cy.visit(`/${claimUrl}`);
      cy.wait(2000);
    });

    it("should handle feedback for a failed wallet provider transaction", () => {
      cy.get(".additional-details", { timeout: 15000 }).first().should("be.visible").invoke("click");

      cy.get("button.make-claim").first().should("be.visible").click();
      cy.get(".claim-loader").first().should("be.visible");
      cy.get(".invalidator").first().should("not.be.visible");
      // cy.get("#claim-loader").should("not.be.visible"); // gets stuck here
    });
  });
});

function setupIntercepts() {
  cy.intercept("POST", "*", (req) => {
    // return a 404 for rpc optimization meaning no successful RPC
    // to return our balanceOf and allowance calls
    if (req.body.method == "eth_getBlockByNumber") {
      req.reply({
        statusCode: 404,
        body: {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Method not found",
          },
          id: 1,
        },
      });
    }

    if (req.body.method == "eth_sendTransaction") {
      req.reply({
        statusCode: 404,
        body: {
          jsonrpc: "2.0",
          id: 44,
          result: "0x",
        },
      });
    }

    if (req.body.method == "eth_call") {
      const selector = req.body.params[0].data.slice(0, 10);

      // balanceOf
      if (selector == "0x70a08231") {
        req.reply({
          statusCode: 200,
          body: {
            jsonrpc: "2.0",
            id: 45,
            result: "0x00000000000000000000000000000000000000000000478cf7610f95b9e70000",
          },
        });
      } else if (selector == "0xdd62ed3e") {
        //  allowance

        req.reply({
          statusCode: 200,
          body: {
            jsonrpc: "2.0",
            id: 46,
            result: "0x0000000000000000000000000000000000c097ce7bc906e58377f59a8306ffff",
          },
        });
      }
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

function stubEthereum(address?: string, signer?: JsonRpcSigner) {
  cy.on("window:before:load", (win) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((win as any).ethereum = {
      isMetaMask: true,
      enable: cy.stub().resolves([address]),
      request: cy.stub().callsFake(async (method) => providerFunctions(method)),
      on: cy.stub().callsFake((event, cb) => {
        if (event == "accountsChanged") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (win as any).ethereum.onAccountsChanged = cb;
        }
      }),
      autoRefreshOnNetworkChange: false,
      chainId: "0x7a69",
      selectedAddress: address,
      requestAccounts: cy.stub().resolves([address]),
      send: cy.stub().callsFake(async (method) => providerFunctions(method)),
    }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signer ? ((win as any).signer = signer) : null;
  });
}

function providerFunctions(method: string) {
  switch (method) {
    case "eth_requestAccounts":
      return [beneficiary];
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
      return [beneficiary];
    case "eth_signTypedData_v4":
      return "address";
    case "eth_estimateGas":
      return "0x00";
    case "eth_sendTransaction":
      return "0x";
    case "eth_call":
      return "0x";
  }
}

// placed here due to length
const claimUrl =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIwIn0sIm5vbmNlIjoiNTM2ODA1OTA4ODcxOTE5NzkzMTM3NDczMTk1MTc3NTIyOTQ0ODQ1MTkwNDE4NjUxMzY5Mjk1Mjg3OTQyNjA5NzI3NDg5MzU2MDY1NTAiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiIwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHgzMTBkOGFmYWRkY2VlYTZmNWNhNGRkMmMzNGM5ZDBhNmVlMDQzYTJhMjExZDU4Y2E4ZDMxM2I4MmViZDc0YWU4MGJiYzc5ODE4Mjc2MmU1N2M3ODE2MTljZjlhYmE3Y2ZmYTJlZjJmNTBlYzk5ZThjMjY2YWEzMzA1NjdkZTI5MjFiIiwibmV0d29ya0lkIjozMTMzN30seyJ0eXBlIjoiZXJjMjAtcGVybWl0IiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4ZTkxRDE1M0UwYjQxNTE4QTJDZThEZDNENzk0NEZhODYzNDYzYTk3ZCIsImFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiI2Nzk4MzU5OTA4NDY0NDc4MDExODU5ODU4ODIyOTc2NDQ5NTk4MzkwNzA2MDYxMTIzODM2Nzg3NzUyMzAxNjk0NzQ5MzcyNjY4NjU5OCIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDMxMGQ4YWZhZGRjZWVhNmY1Y2E0ZGQyYzM0YzlkMGE2ZWUwNDNhMmEyMTFkNThjYThkMzEzYjgyZWJkNzRhZTgwYmJjNzk4MTgyNzYyZTU3Yzc4MTYxOWNmOWFiYTdjZmZhMmVmMmY1MGVjOTllOGMyNjZhYTMzMDU2N2RlMjkyMWIiLCJuZXR3b3JrSWQiOjMxMzM3fV0=";
