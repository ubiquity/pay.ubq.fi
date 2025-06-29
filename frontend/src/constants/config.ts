// frontend/src/constants/config.ts
import { Address } from "viem";

// Address that receives CowSwap partner fees
export const COWSWAP_PARTNER_FEE_RECIPIENT: Address = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";

// Partner fee in basis points (0.1% = 10 bps)
// Applied to all swaps where the output token is NOT UUSD.
export const COWSWAP_PARTNER_FEE_BPS = 10;

/**
 * RPC endpoint for blockchain calls.
 * - In development, it uses https://rpc.ubq.fi
 * - In production, it uses /rpc for performance.
 */
export const RPC_URL = import.meta.env.DEV ? "https://rpc.ubq.fi" : "/rpc";

// Universal contract addresses (same on all chains)
export const OLD_PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const NEW_PERMIT2_ADDRESS: Address = "0xd635918A75356D133d5840eE5c9ED070302C9C60";

/**
 * PermitAggregator contract address - deterministic across all chains via CREATE2
 * v0 (unused vars): 0x8af3c0c99d2038b9cadc88ce66633cf311f3b95f (salt 0x00)
 * v1 (cleaned): 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 (salt 0x01)
 */
export const PERMIT_AGGREGATOR_ADDRESS: Address = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";

// Mapping of Chain IDs to human-readable names
export const NETWORK_NAMES: { [chainId: number]: string } = {
  1: "Mainnet",
  100: "Gnosis",
  31337: "Anvil",
  // Add other supported network names as needed
};
