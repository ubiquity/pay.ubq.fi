/* eslint-disable sonarjs/no-duplicate-string */
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";

const beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/**
 * MM is an extension and communicates with the page in a way that
 * cannot be easily intercepted. For instance, calling `eth_accounts`
 * via the wallet provider will not be intercepted, and any calls to the provider
 * will be made directly to the provider and in the case of anvil we'll always
 * have access to the signer without authentication.
 *
 * For this reason, it's kinda difficult to simulate failed transactions due
 * to wallet provider issues as 1. Anvil will always succeed and 2. Returning
 * a spoofed error causes the claim-loader to infite spin. This may be due to
 * how the tests are structured or due to how errors are being handled in the portal.
 *
 * We are injecting the signer as a global variable to the window object
 * which is applied in an error handler of connectWallet.
 *
 * This is a bit of a hack, but it's the only way to get a valid signer
 * into the test env without having extensions installed.
 *
 */

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
      /**
       * This covers a user declining to connect their wallet
       */
      cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

      cy.get("button[id='make-claim']").should("be.visible").click();
      cy.get("#invalidator").should("not.be.visible");
      cy.get("#claim-loader").should("not.be.visible");
      cy.get("#view-claim").should("not.be.visible").and("include.text", "View Claim");

      cy.get("body").should("contain.text", "This reward is not for you");
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
      } else if (selector == "0x95d89b41" || selector == "0x313ce567" || selector == "0x4fe02b44") {
        // decimals and symbol
        // get names?
        // nonceBitmap
      } else if (selector == "0xcbf8b66c") {
        // permit
        // req.destroy();
      }
    }
  });

  cy.intercept("POST", "https://gnxgtwvmduxcwucovxqp.supabase.co/rest/v1/*", {
    statusCode: 200,
    body: {},
  });
  cy.intercept("PATCH", "https://gnxgtwvmduxcwucovxqp.supabase.co/rest/v1/*", {
    statusCode: 200,
    body: {},
  });
  cy.intercept("GET", "https://gnxgtwvmduxcwucovxqp.supabase.co/rest/v1/*", {
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
      request: cy.stub().callsFake(async (method) => {
        if (method == "eth_requestAccounts") {
          return [address];
        }
        if (method == "wallet_sendDomainMetadata") {
          return true;
        }
        if (method == "wallet_addEthereumChain") {
          return true;
        }
        if (method == "wallet_switchEthereumChain") {
          return true;
        }
        if (method == "wallet_watchAsset") {
          return true;
        }
        if (method == "eth_chainId") {
          return "0x7a69";
        }
        if (method == "eth_accounts") {
          return [address];
        }
        if (method == "eth_signTypedData_v4") {
          return "address";
        }

        if (method == "eth_estimateGas") {
          return "0x00";
        }

        if (method == "eth_sendTransaction") {
          return "0x";
        }

        if (method == "eth_call") {
          return "0x";
        }
      }),
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
      send: cy.stub().callsFake(async (method) => {
        if (method == "eth_requestAccounts") {
          return [address];
        }
        if (method == "wallet_sendDomainMetadata") {
          return true;
        }
        if (method == "wallet_addEthereumChain") {
          return true;
        }
        if (method == "wallet_switchEthereumChain") {
          return true;
        }
        if (method == "wallet_watchAsset") {
          return true;
        }
        if (method == "eth_chainId") {
          return "0x7a69";
        }
        if (method == "eth_accounts") {
          return [address];
        }
        if (method == "eth_signTypedData_v4") {
          return;
        }

        if (method == "eth_sendTransaction") {
          return "0x";
        }

        if (method == "eth_call") {
          return "0x";
        }

        if (method == "eth_estimateGas") {
          return "0x00";
        }

        if (method == "wallet_watchAsset") {
          return true;
        }
      }),
    }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signer ? ((win as any).signer = signer) : null;
  });
}

// placed here due to length
const claimUrl =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjExMTAwMTcxMzI2MzgxMjMwODc0NzIyNjQzODc5NzEyMzUyODY1MDc1NTE5OTAzNDE5OTg2MjExMjE4OTU2NTE5NzY5MDA2MTUwNjk4NiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg1M2U5Mzk4MjU5NmZkNGY5N2VmNTY5MDAzOGQwZjNlNmM0NTk3YzA0YjhiMDM2NDFiZGNkYjRjZWQzNzMxMTA3M2VlMmZlZTQ2MWZkMjI1MWNhYjFhMDIzMGJiNDY3N2UzM2UyNmJjMTUyNDZkMjZmOTFkY2YxZTdmOGI0Zjc1MzFjIiwibmV0d29ya0lkIjozMTMzN30seyJ0eXBlIjoiZXJjMjAtcGVybWl0IiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4ZTkxRDE1M0UwYjQxNTE4QTJDZThEZDNENzk0NEZhODYzNDYzYTk3ZCIsImFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiIxMTM1Mjc0Mzk4NDkzOTE5OTY2NzU3OTAyNjg0MDUxOTk0NDkwODIxMzUzNzQxMjg4NzQ3ODcxNDQ0OTE0OTI5NzAwNjg4MDQ4ODM1MDciLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiI5MDAwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg1M2U5Mzk4MjU5NmZkNGY5N2VmNTY5MDAzOGQwZjNlNmM0NTk3YzA0YjhiMDM2NDFiZGNkYjRjZWQzNzMxMTA3M2VlMmZlZTQ2MWZkMjI1MWNhYjFhMDIzMGJiNDY3N2UzM2UyNmJjMTUyNDZkMjZmOTFkY2YxZTdmOGI0Zjc1MzFjIiwibmV0d29ya0lkIjozMTMzN31d";

// const freshPermit =
//   "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6Ijg3NDg4NTI4MDI4NTg2Njg3NTA2NjEwOTc5NzI2ODQ5MjE0ODE2ODA1ODgwNDM5OTQwMjI5MTU3NTQyNDYyNTI3NTk1MTU2MjM2NzMiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NzA5OTc5NzBDNTE4MTJkYzNBMDEwQzdkMDFiNTBlMGQxN2RjNzlDOCIsInNpZ25hdHVyZSI6IjB4OTdhYmVkYzUzYjJlMzAwZGI3ZWI0MjhjN2ZhNjUwYjZlMmE4NWExZGY1M2Q5ODYwMzhjMjNiZmRhMjRiOWFlMDVhMWQyNDZjYzIzZWE0YWY0YWE2ZmI4NmNiZTFiOGUxMWIyNDY2MTM5NGQxNjQwZDA4YTNhMWY5ZDgwMGJhMWUxYiIsIm5ldHdvcmtJZCI6MzEzMzd9LHsidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiI5MDAwMDAwMDAwMDAwMDAwMDAwIn0sIm5vbmNlIjoiNzk1MTcyNzkwODkwMzkxNjQzOTk1Mjc3OTc2MTU3MDIyMjk1NDgxOTIwMDQxNDA4NDM1MjMzODQwNTc1MTU0Njk5NjQ5MjEzMTE2NDUiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiI5MDAwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg5N2FiZWRjNTNiMmUzMDBkYjdlYjQyOGM3ZmE2NTBiNmUyYTg1YTFkZjUzZDk4NjAzOGMyM2JmZGEyNGI5YWUwNWExZDI0NmNjMjNlYTRhZjRhYTZmYjg2Y2JlMWI4ZTExYjI0NjYxMzk0ZDE2NDBkMDhhM2ExZjlkODAwYmExZTFiIiwibmV0d29ya0lkIjozMTMzN31d";
