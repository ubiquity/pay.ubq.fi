/* eslint-disable sonarjs/no-duplicate-string */
import { spawn } from "child_process";

const url = "http://localhost:8545";

const anvil = spawn("anvil", ["--chain-id", "31337", "--fork-url", "https://gnosis.drpc.org", "--host", "127.0.0.1", "--port", "8545"], {
  stdio: "inherit",
});

setTimeout(() => {
  console.log(`\n\n Anvil setup complete \n\n`);
}, 5000);

// anvil --chain-id 31337 --fork-url https://eth.llamarpc.com --host 127.0.0.1 --port 8546

spawn("cast", ["rpc", "--rpc-url", url, "anvil_impersonateAccount", "0xba12222222228d8ba445958a75a0704d566bf2c8"], {
  stdio: "inherit",
});
spawn(
  "cast",
  [
    "send",
    "--rpc-url",
    url,
    "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    "--unlocked",
    "--from",
    "0xba12222222228d8ba445958a75a0704d566bf2c8",
    "transfer(address,uint256)(bool)",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "337888400000000000000000",
  ],
  {
    stdio: "inherit",
  }
);
spawn(
  "cast",
  [
    "send",
    "--rpc-url",
    url,
    "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    "--unlocked",
    "--from",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "approve(address,uint256)(bool)",
    "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "9999999999999991111111119999999999999999",
  ],
  {
    stdio: "inherit",
  }
);
spawn(
  "cast",
  [
    "send",
    "--rpc-url",
    url,
    "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    "--unlocked",
    "--from",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "approve(address,uint256)(bool)",
    "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "999999999999999111119999999999999999",
  ],
  {
    stdio: "inherit",
  }
);

anvil.on("close", (code) => {
  console.log(`Anvil exited with code ${code}`);
});

anvil.on("error", (err) => {
  console.error("Failed to start Anvil", err);
});
