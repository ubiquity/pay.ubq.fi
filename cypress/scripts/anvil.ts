/* eslint-disable sonarjs/no-duplicate-string */
import { spawn } from "child_process";
import { getFastestRpcUrl } from "../../shared/helpers";

async function forkNetwork() {
  const fastestRpcUrl = await getFastestRpcUrl(100);

  const anvil = spawn("anvil", ["--chain-id", "31337", "--fork-url", fastestRpcUrl, "--host", "127.0.0.1", "--port", "8545"], {
    stdio: "inherit",
  });

  anvil.on("close", (code) => {
    console.log(`Anvil exited with code ${code}`);
  });

  anvil.on("error", (err) => {
    console.error("Failed to start Anvil", err);
  });
}

forkNetwork().catch(console.error);
