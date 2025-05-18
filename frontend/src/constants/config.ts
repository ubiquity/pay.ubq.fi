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

// Mapping of Chain IDs to human-readable names
export const NETWORK_NAMES: { [chainId: number]: string } = {
  1: "Mainnet",
  100: "Gnosis",
  // Add other supported network names as needed
};
