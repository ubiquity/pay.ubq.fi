import { logERC20Permit } from "./generate-erc20-permit-url";
import { generateERC721Permit } from "./generate-erc721-permit-url";
import { verifyEnvironmentVariables } from "./utils";

(async () => {
  verifyEnvironmentVariables();
  generateERC721Permit().catch(console.error);
  logERC20Permit(process.env).catch(console.error);
})().catch(console.error);
