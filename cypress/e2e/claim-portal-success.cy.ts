/* eslint-disable sonarjs/no-duplicate-string */
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { Wallet } from "ethers";

const beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // anvil
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

      cy.get('table[data-make-claim="ok"]').should("exist").and("include.text", "337888.4 WXDAI");

      cy.get("button[id='make-claim']").invoke("click");

      cy.get("#invalidator").should("not.be.visible");

      cy.get("#claim-loader").should("be.visible").as("loader");

      cy.wait(5000); // required for the action to complete

      cy.get("@loader").should("not.be.visible");

      cy.get("#view-claim").should("be.visible").and("include.text", "View Claim");

      // anvil confirms it instantly so there is two notifications
      cy.get("body").should("contain.text", "Transaction sent");
      cy.get("body").should("contain.text", "Claim Complete");
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

      cy.get("body").should("contain.text", "This reward is not for you");
    });
  });
});

function setupStubs() {
  const provider = new JsonRpcProvider("http://localhost:8545");
  const signer = provider.getSigner(beneficiary);
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
          result: {
            author: "0x54e191b01aa9c1f61aa5c3bce8d00956f32d3e71",
            difficulty: "0x0",
            extraData: "0x4e65746865726d696e64",
            gasLimit: "0x1036640",
            gasUsed: "0x6763e5",
            hash: "0x407c72c5ae29ac6ffe6e3cefc592bf8d2bf4a8e0057ccfd1c4c7f11ab365977e",
            logsBloom:
              "0x640beb0d6578149cea2f950699258ce63d056392a4d0d2701834000a48381453bb508c109686c16aa69094201a0a45092c35a83549352240e42020b8560ff8e8027b89170c0713a4829dd68d009c805ada3edf8f9b3659464f0b4481408a6539006de405824712c52e5017a82d83ea100200ce70617cb003a5d397d00ae5044bb21ec5d0a152ad6168e463941a539082441dc04bfa5405c3031ab821b6d2565605e2c444a798ca0e5a82222b1723c0030340250187cc5905604527122707c500a00f951648950e600490a29601d3430224b87b03680a55d44080913ca64d6e3212c44645088c4194ade9576565a57c31f6005c1351783059a51969601c56b4c9",
            miner: "0x54e191b01aa9c1f61aa5c3bce8d00956f32d3e71",
            mixHash: "0x285fc6bec5ed8d335f2fe4f1e8526cfebf2f650de390d24a80d7a26353a86263",
            nonce: "0x0000000000000000",
            number: "0x1faad3c",
            parentHash: "0x2b0482bcb01362281ea62af8f424020c60b5b2d091ba3a91c2c5409facf3f4b5",
            receiptsRoot: "0x19b2d7960b3aa6d85bb89c796eed7e563f98879bb2923781514bc1a2e9afcab2",
            sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
            size: "0x3dd5",
            stateRoot: "0x4bbbf4dab0b363cd3a469ee23f2ba34c04fb9531a7812f35d19a456b95ce2df3",
            totalDifficulty: "0x182cd9fffffffffffffffffffffffffea9528a2",
            timestamp: "0x66093cb8",
            baseFeePerGas: "0x49",
            transactions: [
              "0x6dd7181abf5c33ef988a846e13c3cd079ae9070aacef2235885c95ecbf659dd2",
              "0x5841c70fd3471baece987021f09b5c7fbb8eb5abd6b69a80be0a9e47a6bb2a7c",
              "0xc0cb042f01e692db2ea8b1910220cdc6184f365f6e0dfe3938c225f556017d02",
              "0xb51a6e7a02566b2ef0a85c688adf020c8a247e7d408bf7793c888c011eea0d8a",
              "0x1bb4985d19175fc3431526c9ce01f423e47a49c674de58cad75950e343e90c69",
              "0x9144a9e63da9787961a61ee26df25b3c468fc7da40e12e9b80d5c398e9d4728a",
              "0xc176772b1f8280dd86239d435f4485c4d7041d61f5d1cf9787632c80775f38e8",
              "0xccb751a6ec7f12c5213c0f3293573754c096d02f88599f9814fd285ec5c4769c",
              "0x39b88eda15263cc35866775a2575f6aa537507e60e1e871ea9780fc304ac9200",
              "0x8bf8a95ba856c20e5d0fc01d9b2625fb0b3b56c9773969903eb9d94b87bdfa5c",
              "0x47509dd87254961d30e28941bffcf3d670a7b5e16076b06f38e636cf5246a61b",
              "0xe7fd644dc604ecdaa81e1f956b98ad870f526c30fca6c6581afa2639b199d554",
              "0x418a3b92316cf510ed8a015bd2d95c1989c504eea5952da98e6b0677ef30bbae",
            ],
            transactionsRoot: "0xb4a1895451a4b3a9b7ff72f7226604289aa54043c22141d29d7e697311fe8f71",
            uncles: [],
            withdrawals: [
              {
                index: "0x1e3b6bd",
                validatorIndex: "0x2eea4",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb710e7",
              },
              {
                index: "0x1e3b6be",
                validatorIndex: "0x2eea5",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb78afa",
              },
              {
                index: "0x1e3b6bf",
                validatorIndex: "0x2eea6",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb6f51c",
              },
              {
                index: "0x1e3b6c0",
                validatorIndex: "0x2eea7",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb6de93",
              },
              {
                index: "0x1e3b6c1",
                validatorIndex: "0x2eea8",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb7ab98",
              },
              {
                index: "0x1e3b6c2",
                validatorIndex: "0x2eea9",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb7a5f6",
              },
              {
                index: "0x1e3b6c3",
                validatorIndex: "0x2eeaa",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb6f80a",
              },
              {
                index: "0x1e3b6c4",
                validatorIndex: "0x2eeab",
                address: "0x9f03bfbdf1e026cedb7f606e740a0b3aa16044e8",
                amount: "0xb73e9b",
              },
            ],
            withdrawalsRoot: "0xa22437a0b85a24e7844bdacd756525c8868ff16f707fe55fcd7e714467cce022",
            blobGasUsed: "0x0",
            excessBlobGas: "0x0",
            parentBeaconBlockRoot: "0xe7d34f48290317240c3ef8f58427fa95f641bd3b56b405c1142301e62ab58e9f",
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

function stubEthereum(signer: JsonRpcSigner) {
  // Stubbing the ethereum object
  cy.on("window:before:load", (win) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((win as any).ethereum = {
      isMetaMask: true,
      enable: cy.stub().resolves(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
      request: cy.stub().callsFake(async (method) => {
        if (method === "eth_requestAccounts") {
          return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
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
          return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
        }
        if (method === "eth_signTypedData_v4") {
          return "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        }

        if (method === "eth_estimateGas") {
          return "0x7a69";
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
      selectedAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      requestAccounts: cy.stub().resolves(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
      send: cy.stub().callsFake(async (method) => {
        if (method === "eth_requestAccounts") {
          return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
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
          return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
        }
        if (method === "eth_signTypedData_v4") {
          return "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        }
      }),

      getSigner: () => signer,
    }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((win as any).signer = signer);
  });
}

// placed here due to length
const claimUrl =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjEwODc2OTM3ODM4MTQ4OTY1NTIxMDM2ODQ4NzgzNzgzMDA2MDU0MjAwMzcxOTM0NTY0MzYzMjQ5MDIzMTQ1MTcyOTczMTgzNDgwMTM5MiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwIn0sIm93bmVyIjoiMHg3MDk5Nzk3MEM1MTgxMmRjM0EwMTBDN2QwMWI1MGUwZDE3ZGM3OUM4Iiwic2lnbmF0dXJlIjoiMHg4YWZmYWU1ZTA5YTkyN2QwYjUzNDQ1M2Y4NTE5ZWVlZDE5MzY5MTBkZWFhOGY5YTA0OTM1ODQzNDMzNDA5NmExMTg5ZmVkM2MxNzgyZmU0ZGI5ZTNhMDg2NWVkYjc3ZDczYzliMDliOTgxMTBmN2Q0ZWEyY2Y5ZDBhM2Q1YjhjYzFjIiwibmV0d29ya0lkIjozMTMzN30seyJ0eXBlIjoiZXJjMjAtcGVybWl0IiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4ZTkxRDE1M0UwYjQxNTE4QTJDZThEZDNENzk0NEZhODYzNDYzYTk3ZCIsImFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiI1NjQzNjc4ODI2MzUwOTQ3NTY2NzAwNzA4MDA5ODQ5MDM0MDE1OTExMzYxMjM5NTUyMTA3Mjk3NDkxNzcyNDA2Mzg0NDY2Mjc0NDEzMiIsImRlYWRsaW5lIjoiMTE1NzkyMDg5MjM3MzE2MTk1NDIzNTcwOTg1MDA4Njg3OTA3ODUzMjY5OTg0NjY1NjQwNTY0MDM5NDU3NTg0MDA3OTEzMTI5NjM5OTM1In0sInRyYW5zZmVyRGV0YWlscyI6eyJ0byI6IjB4ZjM5RmQ2ZTUxYWFkODhGNkY0Y2U2YUI4ODI3Mjc5Y2ZmRmI5MjI2NiIsInJlcXVlc3RlZEFtb3VudCI6IjkwMDAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDhhZmZhZTVlMDlhOTI3ZDBiNTM0NDUzZjg1MTllZWVkMTkzNjkxMGRlYWE4ZjlhMDQ5MzU4NDM0MzM0MDk2YTExODlmZWQzYzE3ODJmZTRkYjllM2EwODY1ZWRiNzdkNzNjOWIwOWI5ODExMGY3ZDRlYTJjZjlkMGEzZDViOGNjMWMiLCJuZXR3b3JrSWQiOjMxMzM3fV0=";

const notMeantForYouPermit =
  "?claim=W3sidHlwZSI6ImVyYzIwLXBlcm1pdCIsInBlcm1pdCI6eyJwZXJtaXR0ZWQiOnsidG9rZW4iOiIweGU5MUQxNTNFMGI0MTUxOEEyQ2U4RGQzRDc5NDRGYTg2MzQ2M2E5N2QiLCJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjkxOTk3MjEyMjMyMTcxMDcyMTI5OTIwODIzNjMwOTY3ODE5ODgwNTcyNjcyMTc2ODcwNjU4MzE2Nzk4MjUxNzU4OTQ2MzQ1NDY2OTA1IiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhiYTEyMjIyMjIyMjI4ZDhiYTQ0NTk1OGE3NWEwNzA0ZDU2NmJmMmM4IiwicmVxdWVzdGVkQW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAifSwib3duZXIiOiIweDcwOTk3OTcwQzUxODEyZGMzQTAxMEM3ZDAxYjUwZTBkMTdkYzc5QzgiLCJzaWduYXR1cmUiOiIweDNiYzBjOTA5NzA1NmRhNmJkMzA4NmM4MGRiM2RmZDAzODNjNjgxN2FlZTAwMDExZDFlYTI3NzFkZWVlYjUxNjg1MWE3ZmYyY2UzNGUxNmI1ZjFkNTY1NGRmYzQ5MTk1YjQ4YmE5YmY1YmY0YTllMGRlOGY4ODc3YjBkMTY4NGRmMWMiLCJuZXR3b3JrSWQiOjMxMzM3fSx7InR5cGUiOiJlcmMyMC1wZXJtaXQiLCJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHhlOTFEMTUzRTBiNDE1MThBMkNlOERkM0Q3OTQ0RmE4NjM0NjNhOTdkIiwiYW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6Ijc3MDE3MDM2NzU4NzI2MzU5MTc4ODExMjM0Njk4NTMxMjE2NjYwODc4NzU0NjMwMDc4NzAzMDY4NzA4NzM3MDEzNTYxODIxMDQwODkwIiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhiYTEyMjIyMjIyMjI4ZDhiYTQ0NTk1OGE3NWEwNzA0ZDU2NmJmMmM4IiwicmVxdWVzdGVkQW1vdW50IjoiOTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NzA5OTc5NzBDNTE4MTJkYzNBMDEwQzdkMDFiNTBlMGQxN2RjNzlDOCIsInNpZ25hdHVyZSI6IjB4M2JjMGM5MDk3MDU2ZGE2YmQzMDg2YzgwZGIzZGZkMDM4M2M2ODE3YWVlMDAwMTFkMWVhMjc3MWRlZWViNTE2ODUxYTdmZjJjZTM0ZTE2YjVmMWQ1NjU0ZGZjNDkxOTViNDhiYTliZjViZjRhOWUwZGU4Zjg4NzdiMGQxNjg0ZGYxYyIsIm5ldHdvcmtJZCI6MzEzMzd9XQ==";
