export enum Tokens {
  DAI = "0x6b175474e89094c44da98b954eedeac495271d0f",
  WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
}

export const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const giftCardTreasuryAddress = "0x3B47E3e4758E133acf72684727Dc10550C40e4B9";

// Signer of the permit and owner of the tokens are same in SignatureTransfer
export const permitTokenOwner = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const chainIdToRewardTokenMap = {
  1: Tokens.DAI,
  100: Tokens.WXDAI,
};
