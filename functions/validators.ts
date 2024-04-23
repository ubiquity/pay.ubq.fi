export function validateRequestMethod(expectedMethod: string, receivedMethod: string) {
  if (receivedMethod !== expectedMethod) {
    console.error(
      "Invalid request method.",
      JSON.stringify({
        expectedMethod,
        receivedMethod,
      })
    );
    throw new Error("Invalid request method.");
  }
}

export function validateEnvVars(ctx) {
  if (typeof ctx.env.USE_RELOADLY_SANDBOX != "boolean") {
    throw new Error("USE_RELOADLY_SANDBOX env var must be set to boolean true or false.");
  }
  if (!(ctx.env.RELOADLY_API_CLIENT_ID && ctx.env.RELOADLY_API_CLIENT_SECRET && ctx.env.ADDRESS_PERMIT2 && ctx.env.ADDRESS_GIFT_CARD_TREASURY)) {
    console.error("One or more environment variable is missing.");
    throw new Error("Missing server configuratinos.");
  }
}
