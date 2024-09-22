export enum Tokens {
  DAI = "0x6b175474e89094c44da98b954eedeac495271d0f",
  WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
}

export const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const ubiquityDollarErc20Address = "0x0F644658510c95CB46955e55D7BA9DDa9E9fBEc6";
export const giftCardTreasuryAddress = "0xD51B09ad92e08B962c994374F4e417d4AD435189";

export const chainIdToRewardTokenMap = {
  1: Tokens.DAI,
  100: Tokens.WXDAI,
  31337: Tokens.WXDAI,
};
