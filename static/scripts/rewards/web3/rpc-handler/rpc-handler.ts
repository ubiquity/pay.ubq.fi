import { ethers } from "ethers";

interface RpcHandlerConfig {
  networkId: number;
  autoStorage: boolean;
  cacheRefreshCycles: number;
  rpcTimeout: number;
  networkName: string | null;
  runtimeRpcs: string[] | null;
  networkRpcs: Record<number, string[]> | null;
}

export class RpcHandler {
  private _networkId: number;
  private _autoStorage: boolean;
  private _cacheRefreshCycles: number;
  private _rpcTimeout: number;
  private _networkName: string | null;
  private _runtimeRpcs: string[] | null;
  private _networkRpcs: Record<number, string[]> | null;
  private _latencies: Record<string, number> = {};

  constructor(config: RpcHandlerConfig) {
    this._networkId = config.networkId;
    this._autoStorage = config.autoStorage;
    this._cacheRefreshCycles = config.cacheRefreshCycles;
    this._rpcTimeout = config.rpcTimeout;
    this._networkName = config.networkName;
    this._runtimeRpcs = config.runtimeRpcs;
    this._networkRpcs = config.networkRpcs;
  }

  /**
   * Tests the performance of all available Rpcs for the configured network.
   */
  async testRpcPerformance(): Promise<void> {
    const rpcList = this._getAllRpcs();
    const latencyPromises = rpcList.map((rpc) =>
      this._measureLatency(rpc).then((latency) => {
        if (latency !== null) {
          this._latencies[rpc] = latency;
        }
      })
    );
    await Promise.all(latencyPromises);
  }

  /**
   * Returns the latencies of the tested Rpcs.
   */
  getLatencies(): Record<string, number> {
    return this._latencies;
  }

  /**
   * Retrieves the fastest Rpc provider based on the measured latencies.
   */
  async getFastestRpcProvider(): Promise<ethers.providers.JsonRpcProvider> {
    if (Object.keys(this._latencies).length === 0) {
      await this.testRpcPerformance();
    }

    const sortedRpcs = Object.entries(this._latencies).sort((a, b) => a[1] - b[1]);
    if (sortedRpcs.length === 0) {
      throw new Error("No Rpcs available");
    }

    const fastestRpc = sortedRpcs[0][0];
    return new ethers.providers.JsonRpcProvider(fastestRpc);
  }

  /**
   * Retrieves all Rpc URLs for the configured network.
   */
  private _getAllRpcs(): string[] {
    let rpcs: string[] = [];

    if (this._runtimeRpcs) {
      rpcs = rpcs.concat(this._runtimeRpcs);
    }

    if (this._networkRpcs && this._networkRpcs[this._networkId]) {
      rpcs = rpcs.concat(this._networkRpcs[this._networkId]);
    }

    return rpcs;
  }

  /**
   * Measures the latency of a given Rpc URL.
   * Returns null if the Rpc is unresponsive within the timeout.
   */
  private async _measureLatency(rpc: string): Promise<number | null> {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const start = Date.now();
    try {
      await provider.getBlockNumber();
      return Date.now() - start;
    } catch (error) {
      console.error(`Rpc ${rpc} is unresponsive:`, error);
      return null;
    }
  }
}

/**
 * Retrieves the network name based on the network ID.
 */
export function getNetworkName(networkId: number): string | null {
  const networkNames: Record<number, string> = {
    1: "Ethereum Mainnet",
    100: "Gnosis Chain",
    137: "Polygon",
    // Add other networks as needed
  };
  return networkNames[networkId] || null;
}

/**
 * Defines the Rpc URLs for supported networks.
 */
export const networkRpcs: Record<number, string[]> = {
  1: [
    "https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "https://rpc.ankr.com/eth",
    // Add more Ethereum Mainnet Rpcs
  ],
  100: [
    "https://rpc.gnosis.gateway.fm/",
    "https://rpc.ankr.com/gnosis",
    // Add more Gnosis Chain Rpcs
  ],
  137: [
    "https://rpc-mainnet.maticvigil.com/",
    "https://rpc.ankr.com/polygon",
    // Add more Polygon Rpcs
  ],
  // Add other networks as needed
};

/**
 * Defines the block explorer URLs for supported networks.
 */
export const networkExplorers: Record<number, string> = {
  1: "https://etherscan.io",
  100: "https://gnosisscan.io",
  137: "https://polygonscan.com",
  // Add other networks as needed
};

/**
 * Defines the native currencies for supported networks.
 */
export const networkCurrencies: Record<number, { name: string; symbol: string; decimals: number }> = {
  1: { name: "Ether", symbol: "ETH", decimals: 18 },
  100: { name: "Gnosis", symbol: "GNO", decimals: 18 },
  137: { name: "Matic", symbol: "MATIC", decimals: 18 },
  // Add other networks as needed
};

/**
 * Custom hook to use the RpcHandler.
 */
export function useRpcHandler(networkId: number): RpcHandler {
  const config: RpcHandlerConfig = {
    networkId,
    autoStorage: true,
    cacheRefreshCycles: 5,
    rpcTimeout: 1500,
    networkName: getNetworkName(networkId),
    runtimeRpcs: null,
    networkRpcs: networkRpcs,
  };

  return new RpcHandler(config);
}
