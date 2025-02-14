export const permitAllowedChainIds = [1, 5, 10, 100, 31337];

export const ubiquityDollarAllowedChainIds = [1, 100, 31337];

export const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const giftCardTreasuryAddress = "0xD51B09ad92e08B962c994374F4e417d4AD435189";

export const ubiquityDollarChainAddresses: Record<number, string> = {
  1: "0x0F644658510c95CB46955e55D7BA9DDa9E9fBEc6",
  100: "0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068",
  31337: "0x0F644658510c95CB46955e55D7BA9DDa9E9fBEc6",
};

export const networkToCardMinterToken: Record<number, string> = {
  1: "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103",
  100: "0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068",
  31337: "0xC6ed4f520f6A4e4DC27273509239b7F8A68d2068",
};

export const networkRpcs: Record<number, string> = {
  1: "https://gateway.tenderly.co/public/mainnet",
  5: "https://eth-goerli.public.blastapi.io",
  100: "https://rpc.gnosischain.com",
  31337: "http://127.0.0.1:8545",
};

export const chainIdToNameMap: Record<number, string> = {
  1: "Ethereum",
  5: "Goerli Testnet",
  10: "Optimism",
  100: "Gnosis",
  31337: "Local Testnet",
};
