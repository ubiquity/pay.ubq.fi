import { generateERC20Permit } from "./generate-permit2-url";
import { log, verifyEnvironmentVariables } from "./utils";

export async function generateMultiERC20Permits() {
  for (let i = 0; i < 5; i++) {
    const url = await generateERC20Permit();
    log.ok("Testing URL:");
    console.log(url);
  }
}

generateMultiERC20Permits().catch((error) => {
  console.error(error);
  verifyEnvironmentVariables();
  process.exitCode = 1;
});
