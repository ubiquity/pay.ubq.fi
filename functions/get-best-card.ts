import { BigNumber } from "ethers";
import { getAccessToken, findBestCard } from "./helpers";
import { Context } from "./types";
import { validateEnvVars, validateRequestMethod } from "./validators";

export async function onRequest(ctx: Context): Promise<Response> {
  try {
    validateRequestMethod(ctx.request.method, "GET");
    validateEnvVars(ctx);

    const { searchParams } = new URL(ctx.request.url);
    const country = searchParams.get("country");
    const amount = searchParams.get("amount");

    if (isNaN(Number(amount)) || !(country && amount)) {
      throw new Error(`Invalid query parameters: ${{ country, amount }}`);
    }

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
