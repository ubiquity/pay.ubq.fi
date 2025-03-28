import { createPublicClient, http, PublicClient } from 'viem';
import { gnosis, localhost, mainnet } from 'viem/chains'; // Add other chains as needed

// TODO: Define network RPCs. These defaults are public.
// Consuming environments (Deno backend, Vite frontend) should override
// these with environment variables if necessary (e.g., using Deno.env or import.meta.env).
const networkRpcs: Record<number, string> = {
  1: "https://ethereum.publicnode.com", // Default public RPC for Mainnet
  100: "https://rpc.gnosischain.com",    // Default public RPC for Gnosis
  31337: "http://127.0.0.1:8545",       // Default for local Hardhat/Anvil node
};

// TODO: Implement a way for consuming environments to override networkRpcs if needed.

const clients: Map<number, PublicClient> = new Map();

/**
 * Gets a viem PublicClient for the specified network ID.
 * Caches clients for reuse.
 *
 * @param networkId The chain ID of the network.
 * @returns A viem PublicClient instance.
 * @throws Error if the network ID is unsupported or RPC URL is missing.
 */
export function getRpcClient(networkId: number): PublicClient {
  if (clients.has(networkId)) {
    return clients.get(networkId)!;
  }

  const rpcUrl = networkRpcs[networkId];
  if (!rpcUrl) {
    throw new Error(`Unsupported network ID: ${networkId} or RPC URL not configured.`);
  }

  let chain;
  switch (networkId) {
    case 1:
      chain = mainnet;
      break;
    case 100:
      chain = gnosis;
      break;
    case 31337:
      chain = localhost;
      break;
    default:
      // TODO: Consider adding custom chain definitions for other networks if needed
      throw new Error(`Chain configuration missing for network ID: ${networkId}`);
  }

  const client = createPublicClient({
    chain: chain,
    transport: http(rpcUrl),
  });

  clients.set(networkId, client);
  return client;
}

// TODO: Add functions for wallet interactions (sending transactions) using viem WalletClient
// This will likely live more on the frontend side but might have shared utility functions.

// Example usage (can be removed):
// try {
//   const mainnetClient = getRpcClient(1);
//   console.log("Mainnet Client:", mainnetClient);
//   const blockNumber = await mainnetClient.getBlockNumber();
//   console.log("Mainnet Block Number:", blockNumber);
// } catch (error) {
//   console.error("Error getting RPC client:", error);
// }
