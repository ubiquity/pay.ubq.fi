import { GiftCard, Order, OrderTransaction, RedeemCode } from "../../shared/types";
import { Env } from "./shared";

export interface AccessToken {
  token: string;
  isSandbox: boolean;
}

export interface ReloadlyListGiftCardResponse {
  content: GiftCard[];
  pageable: {
    sort: {
      sorted: boolean;
      unsorted: boolean;
      empty: boolean;
    };
    pageNumber: number;
    pageSize: number;
    offset: number;
    unpaged: boolean;
    paged: boolean;
  };
  totalElements: number;
  totalPages: number;
  last: boolean;
  first: boolean;
  sort: {
    sorted: boolean;
    unsorted: boolean;
    empty: boolean;
  };
  numberOfElements: number;
  size: number;
  number: number;
  empty: boolean;
}

export interface ReloadlyOrderResponse extends Order {}
export interface ReloadlyGetTransactionResponse {
  content: OrderTransaction[];
  pageable: {
    sort: { sorted: boolean; unsorted: boolean; empty: boolean };
    pageNumber: number;
    pageSize: number;
    offset: number;
    unpaged: boolean;
    paged: boolean;
  };
  totalElements: number;
  totalPages: number;
  last: boolean;
  first: boolean;
  sort: { sorted: boolean; unsorted: boolean; empty: boolean };
  numberOfElements: number;
  size: number;
  number: number;
  empty: boolean;
}

export type ReloadlyRedeemCodeResponse = RedeemCode[];

export interface ReloadlyFailureResponse {
  timeStamp: string;
  message: string;
  path: string;
  errorCode: string;
  infoLink?: string;
  details: [];
}

export type Context = EventContext<Env, string, Record<string, string>>;
