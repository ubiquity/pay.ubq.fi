import { Ethereum } from "ethereum-protocol";

declare global {
  interface Window {
    ethereum: Ethereum;
  }
}
