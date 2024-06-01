import { JsonRpcProvider } from "@ethersproject/providers";
import { createProviderProxy } from "./mocks/mock-oc-call-handler";
import { ethers } from "ethers";
import { AppState } from "../static/scripts/rewards/app-state";
import { expect, jest } from "@jest/globals";

const nonceBitmapData = {
  to: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  data: "0x4fe02b44000000000000000000000000d9530f3fbbea11bed01dc09e79318f2f20223716001fd097bcb5a1759ce02c0a671386a0bbbfa8216559e5855698a9d4de4cddea",
  accessList: null,
};

const PROXY_ERROR = "[PROXY] Provider Error -> retrying with new provider";
describe("createProviderProxy", () => {
  let appState: Partial<AppState>;
  let provider: JsonRpcProvider;
  const txHashRegex = new RegExp("0x[0-9a-f]{64}");

  const handler = {
    getLatencies: async () => {
      return {
        LOCAL_HOST: 100,
        "100__http://localhost:85452": 200,
        "100__http://localhost:85453": 300,
        "100__http://localhost:85454": 400,
      };
    },
  };

  beforeEach(async () => {
    appState = {
      networkId: 100,
      provider: new ethers.providers.JsonRpcProvider("http://localhost:8545"),
    };

    provider = createProviderProxy(appState as AppState, handler);
  });

  it("should make a successful get_blockNumber call", async () => {
    const blockNumber = await provider.getBlockNumber();
    expect(blockNumber).toBeGreaterThan(0);
  });

  it("should make a successful eth_call", async () => {
    const nonceBitmap = await nonceBitmapEthCall("http://localhost:8545");
    const data = await nonceBitmap.json();

    expect(data.error).toBeUndefined();
    expect(data.result).toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
  });

  it("should allow an invalidate nonce call to go through", async () => {
    const txData = {
      gas: "0xb371",
      from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      to: "0x000000000022d473030f116ddee9f6b43ac78ba3",
      data: "0x3ff9dcb100cb6493ae939f58e9e22aa5aadb604ea085eedb2ed3784fb6f0f912805f2abc0000000000000000000000000000000000000000000000000000000002000000",
    };

    const txHash = await provider.send("eth_sendTransaction", [txData]);
    expect(txHash).toBeDefined();
    expect(txHash).toMatch(txHashRegex);
  });

  it("should allow a claim call to go through", async () => {
    const txData = {
      gas: "0x1f4f8",
      from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      to: "0x000000000022d473030f116ddee9f6b43ac78ba3",
      data: "0x4fe02b4400000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800d2429b6ec3b99c749d9629667197d4af1dd7ab825c27adf3477c79e9e5ac22",
    };

    const txHash = await provider.send("eth_sendTransaction", [txData]);
    expect(txHash).toBeDefined();
    expect(txHash).toMatch(txHashRegex);
  });
});

describe("Failure cases", () => {
  let appState: Partial<AppState>;
  let provider: JsonRpcProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should make 3 bad calls and then a successful call", async () => {
    appState = {
      networkId: 100,
      provider: new ethers.providers.JsonRpcProvider("http://localhost:85454"),
    };
    const handler = {
      getLatencies: async () => {
        return {
          "100__http://localhost:85452": 200,
          "100__http://localhost:85454": 400,
          "100__http://localhost:85453": 300,
          "10__http://localhost:8545": 600,
        };
      },
    };
    provider = createProviderProxy(appState as AppState, handler);
    const consoleSpy = jest.spyOn(console, "error");

    try {
      await provider.getBlockNumber();
    } catch (er) {
      console.log(er);
    }
    expect(consoleSpy).toHaveBeenCalledWith(PROXY_ERROR);
    expect(consoleSpy).toHaveBeenCalledTimes(3);
  });

  it("should make the very last call should succeed", async () => {
    appState = {
      networkId: 100,
      provider: new ethers.providers.JsonRpcProvider("http://localhost:85452"),
    };
    const handler = {
      getLatencies: async () => {
        return {
          "100__http://localhost:85451": 200,
          "100__http://localhost:85454": 400,
          "100__http://localhost:85453": 300,
          "100__http://localhost:854533": 450,
          "100__http://localhost:854531": 500,
          "100__http://localhost:854532": 350,
          "100__http://localhost:854535": 150,
          "100__http://localhost:854": 150,
          "100__http://localhost:85": 50,
          "100__http://localhost:81": 10,
          "10__http://localhost:8545": 600,
        };
      },
    };
    provider = createProviderProxy(appState as AppState, handler);
    const consoleSpy = jest.spyOn(console, "error");

    try {
      await provider.getBlockNumber();
    } catch (er) {
      console.log(er);
    }
    expect(consoleSpy).toHaveBeenCalledWith();
    expect(consoleSpy).toHaveBeenCalledTimes(10); // 10 because we have 10 bad providers
  });

  it("should throw an error if every call fails 3x", async () => {
    appState = {
      networkId: 100,
      provider: new ethers.providers.JsonRpcProvider("http://localhost:85452"),
    };

    const handler = {
      getLatencies: async () => {
        return {
          "100__http://localhost:85451": 200,
          "100__http://localhost:85454": 400,
          "100__http://localhost:85453": 300,
        };
      },
    };
    provider = createProviderProxy(appState as AppState, handler);
    const consoleSpy = jest.spyOn(console, "error");
    let thrownError = null;
    try {
      await provider.getBlockNumber();
    } catch (er) {
      console.log(er);
      thrownError = er;
    }

    expect(consoleSpy).toHaveBeenCalledWith(PROXY_ERROR);
    expect(consoleSpy).toHaveBeenCalledTimes(10); // 10 because we loop 3 times and have 3 providers + initial call
    expect(thrownError).toEqual(new Error("Failed to call any provider"));
  });
});

// only works with a valid rpc or it throws an error unrelated to app logic
async function nonceBitmapEthCall(rpc: string) {
  return reqMaker(rpc, "eth_call", [nonceBitmapData, "latest"]);
}

function reqMaker(rpc: string, method: string, params: unknown[]) {
  return fetch(rpc, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
}
