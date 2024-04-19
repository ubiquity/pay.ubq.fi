/* eslint-disable sonarjs/no-duplicate-string */
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "ethers";
import { getAddress } from "ethers/lib/utils";

describe("Claims Portal Failures", () => {
  before(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    setupBadStubs();
  });

  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();

    setupIntercepts();

    cy.visit(`/${freshPermit}`);
    cy.wait(2000);
  });

  it("should fail to claim a permit not for meant for them", () => {
    cy.get("#additionalDetails", { timeout: 15000 }).should("be.visible").invoke("click");

    cy.get('table[data-make-claim="ok"]').should("exist");

    cy.get("button[id='make-claim']").invoke("click");

    cy.get("#invalidator").should("not.be.visible");

    cy.get("#claim-loader").should("be.visible");

    cy.get("#view-claim").should("not.be.visible");

    cy.get("body").should("contain.text", "This reward is not for you");
  });
});

function setupBadStubs() {
  const provider = new JsonRpcProvider("http://localhost:8545");
  const signer = null;

  stubEthereum();

  return { provider, signer };
}

function setupIntercepts() {
  cy.intercept("POST", "*", (req) => {
    // return a 404 for rpc optimization meaning no successful RPC
    // to return our balanceOf and allowance calls
    if (req.body.method === "eth_getBlockByNumber") {
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

function stubEthereum() {
  // Stubbing the ethereum object
  cy.on("window:before:load", (win) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((win as any).ethereum = {
      isMetaMask: true,
      enable: cy.stub().resolves([]),
      request: cy.stub().callsFake(async (method) => {
        if (method === "eth_requestAccounts") {
          return [];
        }
        if (method === "wallet_sendDomainMetadata") {
          return true;
        }
        if (method === "wallet_addEthereumChain") {
          return true;
        }
        if (method === "wallet_switchEthereumChain") {
          return true;
        }
        if (method === "wallet_watchAsset") {
          return true;
        }
        if (method === "eth_chainId") {
          return "0x7a69";
        }
        if (method === "eth_accounts") {
          return [];
        }
        if (method === "eth_signTypedData_v4") {
          return "";
        }

        if (method === "eth_estimateGas") {
          return "0x00";
        }
      }),
      on: cy.stub().callsFake((event, cb) => {
        if (event === "accountsChanged") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (win as any).ethereum.onAccountsChanged = cb;
        }
      }),
      autoRefreshOnNetworkChange: false,
      chainId: "0x7a69",
      selectedAddress: "",
      requestAccounts: cy.stub().resolves([]),
      send: cy.stub().callsFake(async (method) => {
        if (method === "eth_requestAccounts") {
          return [];
        }
        if (method === "wallet_sendDomainMetadata") {
          return true;
        }
        if (method === "wallet_addEthereumChain") {
          return true;
        }
        if (method === "wallet_switchEthereumChain") {
          return true;
        }
        if (method === "wallet_watchAsset") {
          return true;
        }
        if (method === "eth_chainId") {
          return "0x7a69";
        }
        if (method === "eth_accounts") {
          return [];
        }
        if (method === "eth_signTypedData_v4") {
          return;
        }
      }),
    }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((win as any).signer = {
        getAddress: () => getAddress(Wallet.createRandom().address),
      });
  });
}

// placed here due to length
// const claimUrl =
//   "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjEwODc2OTM3ODM4MTQ4OTY1NTIxMDM2ODQ4NzgzNzgzMDA2MDU0MjAwMzcxOTM0NTY0MzYzMjQ5MDIzMTQ1MTcyOTczMTgzNDgwMTM5MiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg4YWZmYWU1ZTA5YTkyN2QwYjUzNDQ1M2Y4NTE5ZWVlZDE5MzY5MTBkZWFhOGY5YTA0OTM1ODQzNDMzNDA5NmExMTg5ZmVkM2MxNzgyZmU0ZGI5ZTNhMDg2NWVkYjc3ZDczYzliMDliOTgxMTBmN2Q0ZWEyY2Y5ZDBhM2Q1YjhjYzFjIiwibmV0d29ya0lkIjozMTMzN30seyJ0eXBlIjoiZXJjMjAtcGVybWl0IiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4ZTkxRDE1M0UwYjQxNTE4QTJDZThEZDNENzk0NEZhODYzNDYzYTk3ZCIsImFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiI1NjQzNjc4ODI2MzUwOTQ3NTY2NzAwNzA4MDA5ODQ5MDM0MDE1OTExMzYxMjM5NTUyMTA3Mjk3NDkxNzcyNDA2Mzg0NDY2Mjc0NDEzMiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDhhZmZhZTVlMDlhOTI3ZDBiNTM0NDUzZjg1MTllZWVkMTkzNjkxMGRlYWE4ZjlhMDQ5MzU4NDM0MzM0MDk2YTExODlmZWQzYzE3ODJmZTRkYjllM2EwODY1ZWRiNzdkNzNjOWIwOWI5ODExMGY3ZDRlYTJjZjlkMGEzZDViOGNjMWMiLCJuZXR3b3JrSWQiOjMxMzM3fV0=";

const freshPermit =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6Ijg3NDg4NTI4MDI4NTg2Njg3NTA2NjEwOTc5NzI2ODQ5MjE0ODE2ODA1ODgwNDM5OTQwMjI5MTU3NTQyNDYyNTI3NTk1MTU2MjM2NzMiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NzA5OTc5NzBDNTE4MTJkYzNBMDEwQzdkMDFiNTBlMGQxN2RjNzlDOCIsInNpZ25hdHVyZSI6IjB4OTdhYmVkYzUzYjJlMzAwZGI3ZWI0MjhjN2ZhNjUwYjZlMmE4NWExZGY1M2Q5ODYwMzhjMjNiZmRhMjRiOWFlMDVhMWQyNDZjYzIzZWE0YWY0YWE2ZmI4NmNiZTFiOGUxMWIyNDY2MTM5NGQxNjQwZDA4YTNhMWY5ZDgwMGJhMWUxYiIsIm5ldHdvcmtJZCI6MzEzMzd9LHsidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiI5MDAwMDAwMDAwMDAwMDAwMDAwIn0sIm5vbmNlIjoiNzk1MTcyNzkwODkwMzkxNjQzOTk1Mjc3OTc2MTU3MDIyMjk1NDgxOTIwMDQxNDA4NDM1MjMzODQwNTc1MTU0Njk5NjQ5MjEzMTE2NDUiLCJkZWFkbGluZSI6IjExNTc5MjA4OTIzNzMxNjE5NTQyMzU3MDk4NTAwODY4NzkwNzg1MzI2OTk4NDY2NTY0MDU2NDAzOTQ1NzU4NDAwNzkxMzEyOTYzOTkzNSJ9LCJ0cmFuc2ZlckRldGFpbHMiOnsidG8iOiIweGYzOUZkNmU1MWFhZDg4RjZGNGNlNmFCODgyNzI3OWNmZkZiOTIyNjYiLCJyZXF1ZXN0ZWRBbW91bnQiOiI5MDAwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg5N2FiZWRjNTNiMmUzMDBkYjdlYjQyOGM3ZmE2NTBiNmUyYTg1YTFkZjUzZDk4NjAzOGMyM2JmZGEyNGI5YWUwNWExZDI0NmNjMjNlYTRhZjRhYTZmYjg2Y2JlMWI4ZTExYjI0NjYxMzk0ZDE2NDBkMDhhM2ExZjlkODAwYmExZTFiIiwibmV0d29ya0lkIjozMTMzN31d";
