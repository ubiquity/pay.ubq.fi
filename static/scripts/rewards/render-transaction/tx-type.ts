import { Type as T, StaticDecode } from "@sinclair/typebox";
import { BigNumber } from "ethers";

const TBigNumber = T.Transform(T.Union([T.RegExp(/^\d+$/), T.Number()]))
  .Decode(value => BigNumber.from(value))
  .Encode(value => value.toString());

const TNetworkId = T.Transform(T.Union([T.RegExp(/^0x\d+$/), T.Number()]))
  .Decode(value => (typeof value === "number" ? "0x" + value.toString(16) : value))
  .Encode(value => value);

const TAddress = T.Transform(T.RegExp(/^0x[a-fA-F0-9]{40}$/))
  .Decode(value => value.toLowerCase())
  .Encode(value => value);

const TSignature = T.Transform(T.RegExp(/^0x[a-fA-F0-9]+$/))
  .Decode(value => value.toLowerCase())
  .Encode(value => value);

const Permit = T.Object({
  type: T.Literal("permit"),
  permit: T.Object({
    permitted: T.Object({
      token: TAddress,
      amount: TBigNumber,
    }),
    nonce: TBigNumber,
    deadline: TBigNumber,
  }),
  transferDetails: T.Object({
    to: TAddress,
    requestedAmount: TBigNumber,
  }),
  owner: TAddress,
  signature: TSignature,
  networkId: TNetworkId,
});

export type Permit = StaticDecode<typeof Permit>;

const NftMint = T.Object({
  type: T.Literal("nft-mint"),
  request: T.Object({
    beneficiary: TAddress,
    deadline: TBigNumber,
    keys: T.Array(T.String()),
    nonce: TBigNumber,
    values: T.Array(T.String()),
  }),
  nftMetadata: T.Object({
    GITHUB_ORGANIZATION_NAME: T.String(),
    GITHUB_REPOSITORY_NAME: T.String(),
    GITHUB_ISSUE_ID: T.String(),
    GITHUB_USERNAME: T.String(),
    GITHUB_CONTRIBUTION_TYPE: T.String(),
  }),
  nftAddress: TAddress,
  networkId: TNetworkId,
  signature: TSignature,
});

export type NftMint = StaticDecode<typeof NftMint>;

export const ClaimTx = T.Union([Permit, NftMint]);

export type ClaimTx = StaticDecode<typeof ClaimTx>;
