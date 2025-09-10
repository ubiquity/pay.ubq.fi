import { Address } from "viem";
import { mainnet, gnosis, base, arbitrum } from "viem/chains"; // Import chain definitions

// Removed manually defined Chain IDs

export interface RewardTokenInfo {
  address: Address;
  symbol: string;
  decimals: number; // Decimals are needed for formatting and calculations
}

// --- Gnosis Chain (100) ---
const GNOSIS_TOKENS: RewardTokenInfo[] = [
  { address: "0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068", symbol: "UUSD", decimals: 18 }, // Real UUSD address
  { address: "0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1", symbol: "WETH", decimals: 18 }, // Real WETH address
  { address: "0x4ECaBa5870353805a9F068101A40E0f32ed605C6", symbol: "USDT", decimals: 6 }, // Real USDT address
  { address: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83", symbol: "USDC", decimals: 6 }, // Real USDC address
  { address: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", symbol: "WXDAI", decimals: 18 }, // Real WXDAI address
];

// --- Ethereum Mainnet (1) ---
const MAINNET_TOKENS: RewardTokenInfo[] = [
  // !!! IMPORTANT: Replace placeholder UUSD address when known !!!
  { address: "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103", symbol: "UUSD", decimals: 18 }, // <<< PLACEHOLDER UUSD ADDRESS
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 }, // Common WETH
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 }, // Common USDT
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 }, // Common USDC
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 }, // Common DAI
];

// --- Base (8453) ---
const BASE_TOKENS: RewardTokenInfo[] = [
  // UUSD not deployed on Base
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 }, // Official WETH
  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 }, // Official USDC (bridged)
  // Add others if needed, e.g., DAI, USDT might have bridged versions
];

// --- Arbitrum One (42161) ---
const ARBITRUM_ONE_TOKENS: RewardTokenInfo[] = [
  // UUSD not deployed on Arbitrum
  { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18 }, // Official WETH
  { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 }, // Official USDC (native)
  { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", symbol: "USDC.e", decimals: 6 }, // Bridged USDC
  { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6 }, // Official USDT
  // Add others if needed
];

// --- Aggregated List ---
// Use chain IDs from viem/chains
export const SUPPORTED_REWARD_TOKENS_BY_CHAIN: Record<number, RewardTokenInfo[]> = {
  [gnosis.id]: GNOSIS_TOKENS,
  [mainnet.id]: MAINNET_TOKENS,
  [base.id]: BASE_TOKENS,
  [arbitrum.id]: ARBITRUM_ONE_TOKENS,
};

// Helper function to get tokens for a specific chain
export function getSupportedRewardTokensForChain(chainId: number | undefined): RewardTokenInfo[] {
  if (!chainId) return [];
  return SUPPORTED_REWARD_TOKENS_BY_CHAIN[chainId] || [];
}

// Helper function to get a specific token's info
export function getTokenInfo(chainId: number | undefined, tokenAddress: Address | null | undefined): RewardTokenInfo | undefined {
  if (!chainId || !tokenAddress) return undefined;
  const tokens = getSupportedRewardTokensForChain(chainId);
  return tokens.find((token) => token.address.toLowerCase() === tokenAddress.toLowerCase());
}
