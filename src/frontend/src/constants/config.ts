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
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const PERMIT3: Address = "0xd635918A75356D133d5840eE5c9ED070302C9C60";

// API endpoint for recording permit claims
export const PERMIT_CLAIM_API_ENDPOINT = "/api/permits/record-claim";
