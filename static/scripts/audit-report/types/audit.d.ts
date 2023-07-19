export type ObserverKeys = "isRPC" | "isComment" | "isGit" | "isEther";

export interface ElemInterface {
  id: number;
  tx: string;
  amount: string;
  title: string;
}

export interface GitInterface {
  owner: string;
  repo: string;
  issue_number: number;
  issue_title: string;
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
  };
  s: {
    ether: EtherInterface | undefined;
    git: GitInterface | undefined;
    network: string
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
}

declare type TableIndexTypes = NumberConstructor | StringConstructor | BooleanConstructor | DateConstructor | ObjectConstructor | ArrayConstructor;
interface TableIndex {
  type: TableIndexTypes;
  multiEntry?: boolean;
  unique?: boolean;
  default?: any;
  ref?: string;
}
interface GoDBTableSchema {
  [key: string]: TableIndex | TableIndexTypes;
}
export interface GoDBSchema {
  [table: string]: GoDBTableSchema;
}
