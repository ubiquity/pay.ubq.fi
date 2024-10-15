import { logErc20Permit } from "./generate-erc20-permit-url";
import { generateErc721Permit } from "./generate-erc721-permit-url";
import { verifyEnvironmentVariables } from "./utils";

(async () => {
  verifyEnvironmentVariables();
  generateErc721Permit().catch(console.error);
  logErc20Permit(process.env).catch(console.error);
})().catch(console.error);
