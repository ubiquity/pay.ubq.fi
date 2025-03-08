import { BigNumber } from "ethers";
import { getBestCardParamsSchema } from "../shared/api-types";
import { findBestCard } from "./utils/best-card-finder";
import { getAccessToken } from "./utils/shared";
import { Context } from "./utils/types";
import { validateEnvVars, validateRequestMethod } from "./utils/validators";

export async function onRequest(ctx: Context): Promise<Response> {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const { searchParams } = new URL(ctx.request.url);
    const result = getBestCardParamsSchema.safeParse({
      country: searchParams.get("country"),
      amount: searchParams.get("amount"),
    });
    if (!result.success) {
      throw new Error(`Invalid parameters: ${JSON.stringify(result.error.errors)}`);
    }
    const { country, amount } = result.data;

    const accessToken = await getAccessToken(ctx.env);

    const bestCard = await findBestCard(country, BigNumber.from(amount), accessToken);

    if (bestCard) {
      return Response.json(bestCard, { status: 200 });
    }
    return Response.json({ message: "There are no gift cards available." }, { status: 404 });
  } catch (error) {
    console.error("There was an error while processing your request.", error);
    return Response.json({ message: "There was an error while processing your request." }, { status: 500 });
  }
}
