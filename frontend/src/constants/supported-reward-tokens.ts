import { Address } from 'viem';

export interface RewardTokenInfo {
  address: Address;
  symbol: string;
  decimals: number; // Decimals are needed for formatting and calculations
}

// Placeholder addresses for Gnosis Chain (100) - REPLACE WITH ACTUAL ADDRESSES
const GNOSIS_CHAIN_ID = 100;
const GNOSIS_TOKENS: RewardTokenInfo[] = [
  { address: '0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068', symbol: 'UUSD', decimals: 18 }, // Updated UUSD address
  { address: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1', symbol: 'WETH', decimals: 18 }, // Corrected: This is WETH
  { address: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6', symbol: 'USDT', decimals: 6 },  // Real USDT address
  { address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', symbol: 'USDC', decimals: 6 },  // Real USDC address
  { address: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', symbol: 'WXDAI', decimals: 18 },// Real WXDAI address
];

// Add other chains here as needed
// const MAINNET_CHAIN_ID = 1;
// const MAINNET_TOKENS: RewardTokenInfo[] = [ ... ];

export const SUPPORTED_REWARD_TOKENS_BY_CHAIN: Record<number, RewardTokenInfo[]> = {
  [GNOSIS_CHAIN_ID]: GNOSIS_TOKENS,
  // [MAINNET_CHAIN_ID]: MAINNET_TOKENS,
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
    return tokens.find(token => token.address.toLowerCase() === tokenAddress.toLowerCase());
}
