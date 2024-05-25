export interface GiftCard {
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
}

export interface OrderedProduct {
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
}

export interface Order {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  recipientEmail: string;
  customIdentifier: string;
  status: string;
  product: OrderedProduct;
  smsFee: number;
  recipientPhone: number;
  transactionCreatedTime: string; //"2022-02-28 13:46:00",
  preOrdered: boolean;
}

export interface OrderTransaction {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  recipientEmail: string;
  customIdentifier: string;
  status: string;
  product: OrderedProduct;
  smsFee: number;
  recipientPhone: number;
  transactionCreatedTime: string; //"2022-02-28 13:46:00",
  preOrdered: boolean;
}

export interface RedeemCode {
  cardNumber: string;
  pinCode: string;
}

export interface OrderRequestParams {
  productId: number;
  txHash: string;
  chainId: number;
}

export interface ExchangeRate {
  senderCurrency: string;
  senderAmount: number;
  recipientCurrency: string;
  recipientAmount: number;
}

export interface PriceToValueMap {
  [key: string]: number;
}
export interface ValueToPriceMap {
  [key: string]: number;
}
