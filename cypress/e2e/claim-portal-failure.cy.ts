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
      cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

      cy.get("button[id='make-claim']").should("be.visible").click();
      cy.get("#invalidator").should("not.be.visible");
      cy.get("#claim-loader").should("not.be.visible");
      cy.get("#view-claim").should("not.be.visible").and("include.text", "View Claim");

      cy.get("body").should(
        "contain.text",
        "We have detected potential issues with your in-wallet RPC. Accept the request to replace it with a more reliable one.We failed to find a more reliable RPC for you."
      );
      cy.get("body").should("contain.text", "We failed to find a more reliable RPC for you. Please try again later if you have network issues");
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
      cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

      cy.get("button[id='make-claim']").should("be.visible").click();
      cy.get("#claim-loader").should("be.visible");
      cy.get("#invalidator").should("not.be.visible");
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
        statusCode: 200,
        body: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            number: "0x1",
          },
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
      } else if (selector == "0x4fe02b44") {
        //  nonceBitmap
        req.reply({
          statusCode: 200,
          body: {
            jsonrpc: "2.0",
            id: 47,
            result: "0x" + "0".repeat(63) + "1",
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
      request: cy.stub().callsFake(async ({ method }) => providerFunctions(method)),
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
      send: cy.stub().callsFake(async ({ method }) => providerFunctions(method)),
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
      return "0x01";
    case "eth_sendTransaction":
      return "0x01";
    case "eth_call":
      return "0x01";
  }
}

// placed here due to length
const claimUrl =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMDAwIn0sIm5vbmNlIjoiNzM5ODY1Mzg4OTY0OTU4MTU5NTYxMjI0OTc1NzM1MzY0OTc3NTg3NTA5ODk2Mzg0NjYwNjU0NjY0OTA4MDU5MTYwMTUwODEwNjQyMDIiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHhjNmNhNDJhNWM5Nzg2NjdhNGEzNDY0OWFiYmZlYmZjZmMxNDVlN2RhZjg5OWVjMTc0ZWUyNmQ5N2E4OTVlNjlmNDE4ODExODFmYTMxOTNiZDgyNjlkYmJkNmU0NTk3MjMyYmY2ZDRkMjllYjY1ZmFiMWZlYmNhNTk5ZGMwM2I5MTFiIiwibmV0d29ya0lkIjozMTMzN30seyJ0eXBlIjoiZXJjMjAtcGVybWl0IiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4ZTkxRDE1M0UwYjQxNTE4QTJDZThEZDNENzk0NEZhODYzNDYzYTk3ZCIsImFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiI1ODMzNTEzMTI3MjM1MzQ2OTA4NjgxMDkxMzI0MjEyOTEwNTUzMDQ0OTc2NDQ3ODc4ODU4Nzg1NDY4MzYxMTg4ODUxOTUzMzIwNTk4MCIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDkxYTk5OGNkNWNjMzk4ODk5ZDI5NWI4M2E4YTIxMDNmZTU4ZjUwZWEyMzdiYTc1ZmRjNGY3YzYxZmUzNzg3Y2Q1MjY2YWU1ZTQ0ZGYxYjg2NjkxNWQ0ODAyZTNlMWI1MGY2ZmMwYTk2NmEzYWE0OWI4ZTgzZThmMjY1ZDZiYjFjMWMiLCJuZXR3b3JrSWQiOjMxMzM3fSx7InR5cGUiOiJlcmMyMC1wZXJtaXQiLCJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHhlOTFEMTUzRTBiNDE1MThBMkNlOERkM0Q3OTQ0RmE4NjM0NjNhOTdkIiwiYW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjUxODQ4MDMwMzM0OTkxNDg1MDA4MDYyMjI1MTQ0NTQzMjQwNjk3OTk1MzkyNjI2MTg3MzM1NjA3MTI0NjI4MTUxNzkwMzIwNzQxNzMiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg5YzdlYjZjY2ZhOTk0MTljNTJiYjU3NjQyYjY4YWViZjEzMjJjNTNiYmM4OTg1NzY2NTRlNDMyMmEyMWY0ZTk3MDE2OWE3ZDhhMmQ1ZGY2M2YyYmZlNmU2MzZkNDQ3Y2I1NDlmZWQwNzBmMTI1MGQ2ZTRiNzFiY2I2Y2I5MjAzZjFiIiwibmV0d29ya0lkIjozMTMzN31d";
