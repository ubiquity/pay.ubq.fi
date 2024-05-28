/* eslint-disable sonarjs/no-duplicate-string */
import { spawnSync } from "child_process";

/**
 * Handles the async funding of the testing environment
 * specifically for use within a GitHub Action.
 *
 * Attempts to make tests more reliable by ensuring that the
 * correct allowances and balances are set before running tests.
 *
 * Will attempt to retry a failed action up to 5 times max.
 */

class TestFunder {
  anvilRPC = "http://localhost:8545";
  fundingWallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
  whale = "0xba12222222228d8ba445958a75a0704d566bf2c8";
  expected = {
    allowance: "999999999999999111119999999999999999",
    balance: "337888400000000000000000",
  };

  loader() {
    const steps = ["|", "/", "-", "\\"];
    let i = 0;
    return setInterval(() => {
      process.stdout.write(`\r${steps[i++]}`);
      i = i % steps.length;
    }, 100);
  }

  async execute() {
    const loader = this.loader();

    let isMoving = true;

    while (isMoving) {
      console.log(`Attempting to fund the testing environment`);
      if (!(await this._impersonateAccount(this.whale))) {
        console.log(`Failed to impersonate account -> retrying...`);
        const isSuccess = await this.retry(() => this._impersonateAccount(this.whale));

        if (!isSuccess) {
          console.log(`Failed to impersonate account -> exiting...`);
          isMoving = false;
        }
      }

      console.log(`Approving for funding wallet`);
      if (!(await this._approvePayload(this.fundingWallet))) {
        console.log(`Failed to approve funding wallet -> retrying...`);
        const isSuccess = await this.retry(() => this._approvePayload(this.fundingWallet));

        if (!isSuccess) {
          console.log(`Failed to approve funding wallet -> exiting...`);
          isMoving = false;
        }
      }

      console.log(`Approving for beneficiary wallet`);
      if (!(await this._approvePayload(this.beneficiary))) {
        console.log(`Failed to approve beneficiary wallet -> retrying...`);
        const isSuccess = await this.retry(() => this._approvePayload(this.beneficiary));

        if (!isSuccess) {
          console.log(`Failed to approve beneficiary wallet -> exiting...`);
          isMoving = false;
        }
      }

      console.log(`Transferring funds to funding wallet`);
      if (!(await this._transferPayload())) {
        console.log(`Failed to transfer funds to funding wallet -> retrying...`);
        const isSuccess = await this.retry(() => this._transferPayload());

        if (!isSuccess) {
          console.log(`Failed to transfer funds to funding wallet -> exiting...`);
          isMoving = false;
        }
      }

      if (isMoving) {
        console.log(`Funding complete`);
        break;
      }
    }

    await this.validate();
    clearInterval(loader);
  }

  async retry(fn: () => Promise<any>, retries = 5) {
    let i = 0;
    let isSuccess = false;
    while (i < retries) {
      try {
        isSuccess = await fn();
      } catch (error) {
        console.error(error);
      }

      if (isSuccess) return isSuccess;
      i++;
    }
    throw new Error("Failed to execute function");
  }

  async validate() {
    const allowance = await this._fundingAllowanceCheck();
    const balance = await this._fundingBalanceCheck();

    if (parseInt(allowance) < parseInt(this.expected.allowance)) {
      throw new Error("Allowance is not set correctly");
    }

    if (parseInt(balance) < parseInt(this.expected.balance)) {
      throw new Error("Balance is not set correctly");
    }

    console.log(`Funding wallet is ready for testing`);
    console.log(`Allowance: ${allowance}\n Balance: ${balance}`);
  }

  private async _exec(payload: { command: string; args: string[]; options: any }) {
    const { command, args, options } = payload;
    const result = spawnSync(command, args, options);
    if (result.error) {
      throw result.error;
    }
    return result;
  }

  // pretend to be the whale
  private async _impersonateAccount(address: string) {
    const impersonate = await this._exec({
      command: "cast",
      args: ["rpc", "--rpc-url", this.anvilRPC, "anvil_impersonateAccount", address],
      options: { stdio: "inherit" },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    return impersonate.status === 0;
  }

  private async _fundingAllowanceCheck() {
    const allowance = await this._exec({
      command: "cast",
      args: ["call", this.WXDAI, "allowance(address,address)(uint256)", this.fundingWallet, this.permit2, "--rpc-url", this.anvilRPC],
      options: { encoding: "utf8" },
    });

    return allowance.stdout;
  }
  private async _fundingBalanceCheck() {
    const balance = await this._exec({
      command: "cast",
      args: ["call", this.WXDAI, "balanceOf(address)(uint256)", this.fundingWallet, "--rpc-url", this.anvilRPC],
      options: { encoding: "utf8" },
    });

    return balance.stdout;
  }
  private async _approvePayload(address: string) {
    const approve = await this._exec({
      command: "cast",
      args: [
        "send",
        "--rpc-url",
        this.anvilRPC,
        this.WXDAI,
        "--unlocked",
        "--from",
        address,
        "approve(address,uint256)(bool)",
        this.permit2,
        this.expected.allowance,
      ],
      options: { stdio: "inherit" },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    return approve.status === 0;
  }
  private async _transferPayload() {
    const balance = parseInt(await this._fundingBalanceCheck());
    const expected = parseInt(this.expected.balance);

    if (balance === expected) {
      return true;
    } else if (balance > expected) {
      await this.retry(() => this._clearBalance());
    }

    const transfer = await this._exec({
      command: "cast",
      args: [
        "send",
        "--rpc-url",
        this.anvilRPC,
        this.WXDAI,
        "--unlocked",
        "--from",
        this.whale,
        "transfer(address,uint256)(bool)",
        this.fundingWallet,
        this.expected.balance,
      ],
      options: { stdio: "inherit" },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    return transfer.status === 0;
  }

  private async _clearBalance() {
    console.log(`Funder was overfunded, clearing excess funds`);
    const balance = parseInt(await this._fundingBalanceCheck());
    const difference = BigInt(balance - parseInt(this.expected.balance));

    const clear = await this._exec({
      command: "cast",
      args: [
        "send",
        "--rpc-url",
        this.anvilRPC,
        this.WXDAI,
        "--unlocked",
        "--from",
        this.fundingWallet,
        "transfer(address,uint256)(bool)",
        this.whale,
        difference.toString(),
      ],
      options: { stdio: "inherit" },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    return clear.status === 0;
  }
}

async function main() {
  const funder = new TestFunder();
  await funder.execute();
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
