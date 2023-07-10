import { networkExplorer, networkRpc } from "../constants";
import { TxType } from "./tx-type";

export const app = {
  claimNetworkId: "0x1",
  explorerUrl: networkExplorer["0x1"],
  txData: {
    permit: {
      permitted: {
        token: "",
        amount: "",
      },
      nonce: "",
      deadline: "",
    },
    transferDetails: {
      to: "",
      requestedAmount: "",
    },
    owner: "",
    signature: "",
  } as TxType,
} as AppState;

type AppState = {
  claimNetworkId: keyof typeof networkRpc;
  explorerUrl: string;
  txData: TxType;
};

export const shortenAddress = (address: string): string => {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
};
