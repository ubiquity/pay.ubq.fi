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
  if (!(ctx.env.RELOADLY_API_CLIENT_ID && ctx.env.RELOADLY_API_CLIENT_SECRET)) {
    console.error("One or more environment variable is missing.");
    throw new Error("Missing server configurations.");
  }
}
