import { networkRpc } from "../constants";
import { TxType } from "./tx-type";

export const app = {
  // claimNetworkId: undefined,
  // explorerUrl: networkExplorer[undefined],
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
  claimNetworkId?: keyof typeof networkRpc;
  explorerUrl?: string;
  txData: TxType;
};
