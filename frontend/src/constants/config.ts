// frontend/src/constants/config.ts
import { Address } from "viem";

// Removed unused COWSWAP constants

/**
 * RPC endpoint for blockchain calls.
 * - In development, it uses https://rpc.ubq.fi
 * - In production, it uses /rpc for performance.
 */
export const RPC_URL = import.meta.env.DEV ? "https://rpc.ubq.fi" : `${self.location.origin}/rpc`;

// Universal contract addresses (same on all chains)
export const OLD_PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const NEW_PERMIT2_ADDRESS: Address = "0xd635918A75356D133d5840eE5c9ED070302C9C60";

// Removed unused PERMIT_AGGREGATOR_ADDRESS

// Mapping of Chain IDs to human-readable names
export const NETWORK_NAMES: { [chainId: number]: string } = {
  1: "Mainnet",
  100: "Gnosis",
  31337: "Anvil",
  // Add other supported network names as needed
};
