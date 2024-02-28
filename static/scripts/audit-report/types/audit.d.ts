export type ObserverKeys = "isRPC" | "isComment" | "isGit" | "isEther";

export interface BountyHunter {
  name: string;
  url: string;
}

export interface ElemInterface {
  id: number;
  tx: string;
  amount: string;
  title: string;
  bounty_hunter: BountyHunter;
  owner: string;
  repo: string;
  network: string;
}

export interface GitHubUrlParts {
  owner: string;
  repo: string;
}

export interface SavedData {
  owner: string;
  repo: string;
  id: number;
  network: string;
  tx: string;
  bounty_hunter: {
    url: string;
    name: string;
  };
  amount: string;
  title: string;
}

export interface ChainScanResult {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
  chain: string;
}

export interface GitInterface {
  owner: string;
  repo: string;
  issue_number: number;
  issue_title: string;
  bounty_hunter: BountyHunter;
}

export interface EtherInterface {
  txHash: string;
  timestamp: number;
  block_number: number;
}

export interface StandardInterface {
  k: string;
  t: "git" | "ether";
  c: {
    nonce: string;
    owner: string;
    token: string;
    amount: string;
    to: string;
    deadline: string;
    signature: string;
  } | null;
  s: {
    ether: EtherInterface | undefined;
    git: GitInterface | undefined;
    network: string;
  };
}

export interface TxData {
  permit: {
    permitted: {
      token: string;
      amount: string;
    };
    nonce: string;
    deadline: string;
  };
  transferDetails: {
    to: string;
    requestedAmount: string;
  };
  owner: string;
  signature: string;
}

export interface QuickImport {
  WALLET: string;
  REPO: string;
  PAT: string;
}

declare type TableIndexTypes = NumberConstructor | StringConstructor | BooleanConstructor | DateConstructor | ObjectConstructor | ArrayConstructor;
interface TableIndex {
  type: TableIndexTypes;
  multiEntry?: boolean;
  unique?: boolean;
  default?: NonNullable<unknown>;
  ref?: string;
}
interface GoDBTableSchema {
  [key: string]: TableIndex | TableIndexTypes;
}
export interface GoDBSchema {
  [table: string]: GoDBTableSchema;
}
