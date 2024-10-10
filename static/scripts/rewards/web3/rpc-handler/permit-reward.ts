import { BigNumberish } from "ethers";

export enum TokenType {
  ERC20 = "ERC20",
  ERC721 = "ERC721",
}

interface CommonFields {
  tokenType: TokenType;
  tokenAddress: string;
  beneficiary: string;
  nonce: BigNumberish;
  deadline: BigNumberish;
  owner: string;
  signature: string;
  networkId: number;
}

export interface Erc20PermitReward extends CommonFields {
  tokenType: TokenType.ERC20;
  amount: BigNumberish;
  erc721Request?: never;
}

interface Erc721PermitReward extends CommonFields {
  tokenType: TokenType.ERC721;
  amount: "0" | "1";
  erc721Request?: {
    keys: string[];
    values: string[];
    metadata: {
      GITHUB_ORGANIZATION_NAME: string;
      GITHUB_REPOSITORY_NAME: string;
      GITHUB_ISSUE_NODE_ID: string;
      GITHUB_USERNAME: string;
      GITHUB_CONTRIBUTION_TYPE: string;
    };
  };
}

export type PermitReward = Erc20PermitReward | Erc721PermitReward;
