// frontend/src/constants/config.ts
import { Address } from "viem";


/**
 * RPC endpoint for blockchain calls.
 * - In development (including deno.dev preview links), it uses https://rpc.ubq.fi
 * - In production, it uses /rpc for performance.
 */
const isDevelopment = import.meta.env.DEV || self.location.hostname.includes(".deno.dev");
export const RPC_URL = isDevelopment ? "https://rpc.ubq.fi" : `${self.location.origin}/rpc`;

// Universal contract addresses (same on all chains)
export const OLD_PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const NEW_PERMIT2_ADDRESS: Address = "0xd635918A75356D133d5840eE5c9ED070302C9C60";


// Mapping of Chain IDs to human-readable names
export const NETWORK_NAMES: { [chainId: number]: string } = {
  1: "Mainnet",
  100: "Gnosis",
  31337: "Anvil",
  // Add other supported network names as needed
};

// API endpoint for recording permit claims
export const PERMIT_CLAIM_API_ENDPOINT = "/api/permits/record-claim";
