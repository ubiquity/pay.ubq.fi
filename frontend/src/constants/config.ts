// frontend/src/constants/config.ts
import { Address } from "viem";

// Address that receives CowSwap partner fees
export const COWSWAP_PARTNER_FEE_RECIPIENT: Address = "0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd";

// Partner fee in basis points (0.1% = 10 bps)
// Applied to all swaps where the output token is NOT UUSD.
export const COWSWAP_PARTNER_FEE_BPS = 10;

/**
 * RPC endpoint for blockchain calls.
 * - Uses VITE_RPC_URL from .env (see .env.example).
 * - Defaults to https://rpc.ubq.fi if not set.
 * - For local dev, set VITE_RPC_URL=http://localhost:8000 in .env.
 */
export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://rpc.ubq.fi";

// Universal contract addresses (same on all chains)
export const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/**
 * PermitAggregator contract address - deterministic across all chains via CREATE2
 * v0 (unused vars): 0x8af3c0c99d2038b9cadc88ce66633cf311f3b95f (salt 0x00)
 * v1 (cleaned): <new_address_after_deploy> (salt 0x01)
 */
export const PERMIT_AGGREGATOR_ADDRESS: Address = "0x8af3c0c99d2038b9cadc88ce66633cf311f3b95f";

// Mapping of Chain IDs to human-readable names
export const NETWORK_NAMES: { [chainId: number]: string } = {
  1: "Mainnet",
  100: "Gnosis",
  // Add other supported network names as needed
};

export const PERMIT_AGGREGATOR_CONTRACT_ADDRESS = "0x302da911667ecd7465645a9887d27d35a60a0839";

export const PERMIT_AGGREGATOR_CONTRACT_ADDRESS = "0x780764bb2bf6b4b770a9404f6668cbcaf47995d9";
