import { z } from "zod";

export const getBestCardParamsSchema = z.object({
  country: z.string(),
  amount: z.string(),
});

export type GetBestCardParams = z.infer<typeof getBestCardParamsSchema>;

export const getOrderParamsSchema = z.object({
  orderId: z.string(),
});

export type GetOrderParams = z.infer<typeof getOrderParamsSchema>;

export const postOrderParamsSchema = z.object({
  type: z.union([z.literal("permit"), z.literal("ubiquity-dollar")]),
  productId: z.coerce.number(),
  txHash: z.string(),
  chainId: z.coerce.number(),
  country: z.string(),
  signedMessage: z.optional(z.string()),
});

export type PostOrderParams = z.infer<typeof postOrderParamsSchema>;

export const getRedeemCodeParamsSchema = z.object({
  transactionId: z.coerce.number(),
  signedMessage: z.string(),
  wallet: z.string(),
  permitSig: z.string(),
});

export type GetRedeemCodeParams = z.infer<typeof getRedeemCodeParamsSchema>;
