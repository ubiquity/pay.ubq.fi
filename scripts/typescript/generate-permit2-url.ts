import {generateERC20Permit} from "./generate-erc20-permit-url";
import {generateERC721Permit} from "./generate-erc721-permit-url";
import { verifyEnvironmentVariables } from "./utils";

(async () => {

    generateERC721Permit().catch((error) => {
        console.error(error);
        verifyEnvironmentVariables();
        process.exitCode = 1;
      });

      generateERC20Permit().catch((error) => {
        console.error(error);
        verifyEnvironmentVariables();
        process.exitCode = 1;
      });
})().catch(console.error);