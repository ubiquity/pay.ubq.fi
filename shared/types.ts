export type ReloadlyProduct = {
  productId: number;
  productName: string;
  global: boolean;
  supportsPreOrder: boolean;
  senderFee: number;
  senderFeePercentage: number;
  discountPercentage: number;
  denominationType: "FIXED" | "RANGE";
  recipientCurrencyCode: string;
  minRecipientDenomination: number;
  maxRecipientDenomination: number;
  senderCurrencyCode: string;
  minSenderDenomination: number;
  maxSenderDenomination: number;
  fixedRecipientDenominations: number[];
  fixedSenderDenominations: number[];
  fixedRecipientToSenderDenominationsMap: ValueToPriceMap;
  metadata?: object;
  logoUrls: string[];
  brand: {
    brandId: number;
    brandName: string;
  };
  country: {
    isoName: string;
    name: string;
    flagUrl: string;
  };
  redeemInstruction: {
    concise: string;
    verbose: string;
  };
};

export type ReloadlyListGiftCardResponse = {
  content: ReloadlyProduct[];
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
};

export type ReloadlyOrderedProduct = {
  productId: number;
  productName: string;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currencyCode: string;
  brand: {
    brandId: number;
    brandName: string;
  };
};

export type ReloadlyOrderResponse = {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  recipientEmail: string;
  customIdentifier: string;
  status: string;
  product: ReloadlyOrderedProduct;
  smsFee: number;
  recipientPhone: number;
  transactionCreatedTime: string; //"2022-02-28 13:46:00",
  preOrdered: boolean;
};

export type ReloadlyTransaction = {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  recipientEmail: string;
  customIdentifier: string;
  status: string;
  product: ReloadlyOrderedProduct;
  smsFee: number;
  recipientPhone: number;
  transactionCreatedTime: string; //"2022-02-28 13:46:00",
  preOrdered: boolean;
};
export type ReloadlyGetTransactionResponse = {
  content: ReloadlyTransaction[];
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
};

export type RedeemCode = {
  cardNumber: string;
  pinCode: string;
};
export type ReloadlyRedeemCodeResponse = RedeemCode[];

// TODO: rename this to FailedReloadlyApiResponse
export type NotOkReloadlyApiResponse = {
  timeStamp: string;
  message: string;
  path: string;
  errorCode: string;
  infoLink?: string;
  details: [];
};

export type OrderRequestParams = {
  productId: number;
  txHash: string;
  chainId: number;
};

export type ExchangeRate = {
  senderCurrency: string;
  senderAmount: number;
  recipientCurrency: string;
  recipientAmount: number;
};

export type PriceToValueMap = { [key: string]: number };
export type ValueToPriceMap = { [key: string]: number };
