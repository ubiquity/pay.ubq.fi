import { generateERC20Permit } from "./generate-erc20-permit-url";
import { generateERC721Permit } from "./generate-erc721-permit-url";
import { verifyEnvironmentVariables } from "./utils";

(async () => {
  verifyEnvironmentVariables();
  generateERC721Permit().catch(console.error);
  generateERC20Permit().catch(console.error);
})().catch(console.error);
