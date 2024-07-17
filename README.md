# [pay.ubq.fi](https://pay.ubq.fi)

A vanilla Typescript dApp for claiming Ubiquity Rewards. It also includes tools for generating and invalidating permits and can be used to claim both ERC20 and ERC721 tokens.

## Setup Local Testing Environment

1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation).
2. Create a `.env` file in the project root with the following settings:

- These are the suggested default test environment variables that allow for local setup using the supplied yarn commands. If you want to produce or invalidate real on-chain permits you must change the below values to reflect the real permit information such as address, chain ID, private key and so on.

  ```env
  # Common variables
  CHAIN_ID="31337"
  FRONTEND_URL="http://localhost:8080"
  UBIQUIBOT_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  RPC_PROVIDER_URL="http://127.0.0.1:8545"
  PAYMENT_TOKEN_ADDRESS="0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d"

  # Variables depending on spender (bounty hunter)
  AMOUNT_IN_ETH="1"
  BENEFICIARY_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  ```

## Local Testing

1. Set `.env` variables.
2. Run `yarn test:anvil` in terminal A and `yarn test:fund` in terminal B.
3. In terminal B, run `yarn start`.
4. A permit URL for both ERC20 and ERC721 will be generated.
5. Open the generated permit URL from the console.
6. Connect your wallet (import anvil accounts [0] & [1] into your wallet).
7. Depending on your connected account, either the claim or invalidate button will be visible.
8. To test ERC721 permits, deploy the `nft-rewards` contract from the [repository](https://github.com/ubiquity/nft-rewards).

### Importing Anvil Accounts

1. Open your wallet provider and select `import wallet` or `import account`.
2. Obtain the private keys by running `anvil` or using the yarn command.
3. Copy and paste the private keys into your wallet provider.

### Expected Behavior

#### Setup

- A local blockchain instance will be created for testing.
- The permit URL will be generated in the console. Ensure your console has enough space for the full URL.
- Imported anvil accounts [0] & [1] can claim and invalidate permits.

#### Claiming

- Uses chain id `31337` and RPC provider `http://localhost:8545`.
- Claiming involves transferring tokens from the signer's account to the beneficiary's account.
- Signer must have signed a permit and have enough balance approved for the permit2 contract.

#### Invalidating

- Only the permit signer can invalidate it.
- Invalidating calls `invalidateUnorderedNonces` on the `Permit2` smart contract.

### Considerations

- MetaMask is considered the default wallet provider.
- Ensure correct network selection in your wallet (`http://localhost:8545` with chain id `31337`).
- Use MetaMask Mobile Wallet Browser for mobile testing.

### Errors

- Clear transaction history in MetaMask if transactions hang after restarting the Anvil instance.
- The test suite may show error toasts due to MetaMask spoofing.
- Ensure `.env` is correctly configured and wallet provider network is correct if `Allowance` or `Balance` is `0.00`.
- Always start the Anvil instance before using `yarn start` as permit generation requires an on-chain call to `token.decimals()`.

## How to generate a permit2 URL using the script

1. Admin sets `env.AMOUNT_IN_ETH` and `env.BENEFICIARY_ADDRESS` depending on a bounty hunter's reward and address
2. Admin generates an offline permit URL via `npx tsx generate-permit2-url.ts`. Permit URL example:

```
http://localhost:8080?claim=eyJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHgxMWZFNEI2QUUxM2QyYTYwNTVDOEQ5Y0Y2NWM1NWJhYzMyQjVkODQ0IiwiYW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjQ0NTUxMjc4NTQwNTU0MzM1MDQ2NzU2NDQ3MzM2MjI1ODg5OTE4OTY5MTczODQwNTU0Nzk2NzQ3MzQzMzAwOTg0NzU4MDIyMzY1ODczIiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhjODZhMDU5NzgwMThlMDRkNmVGMmFhNzNFNjlhNzMzQzA2ZDFmODllIiwicmVxdWVzdGVkQW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NTRmNGEzNjQyMkRjOTZkMDg0OTY3NWMxZjBkZDJCOTZEMjc1NThFMiIsInNpZ25hdHVyZSI6IjB4NWI0OTE5MjhmYzI4MzBlMjZiNTViMWUxOWQ3YzVhMmVjNGE2ZmRhYWI1OGFiYjgyOWMwNmYzYzlkNGE4YTc5YjAzYmE2NjlkMDM4YjFmYzg5NjgzYzMyYjBiYTA5MzU2MDRjMGU1MDNjYWE3ZmY2ZWM2MDg2ZWZlYjY2MTY5MjQxYyJ9
```

3. Admin posts offline permit URL in issue comments (with the payment portal domain name)
4. Bounty hunter opens permit URL, connects wallet and clicks a "withdraw" button to get a payment

## How to invalidate a permit2 nonce using the script

This section describes how to invalidate the following [permit](https://github.com/ubiquity/ubiquity-dollar/issues/643#issuecomment-1607152588) (i.e. invalidate a permit2 nonce)

1. Setup `.env` file with the required env variables: `NONCE` (nonce number), `NONCE_SIGNER_ADDRESS` (i.e. the bot's wallet) and `RPC_PROVIDER_URL`. For this [permit URL](https://github.com/ubiquity/ubiquity-dollar/issues/643#issuecomment-1607152588) the `.env` file will look like this:

```
NONCE="9867970486646789738815952475601005014850694197864057371518032581271992954680"
NONCE_SIGNER_ADDRESS="0xf87ca4583C792212e52720d127E7E0A38B818aD1"
RPC_PROVIDER_URL="https://rpc.ankr.com/gnosis"
```

2. Run `yarn nonce:get-invalidate-params`. You will get this output:

```
== Logs ==
Is nonce used: false
--------------------
Params for nonce invalidation via invalidateUnorderedNonces()
wordPos: 38546759713464022417249814357816425839260524210406474107492314770593722479
mask: 72057594037927936

```

3. Open https://gnosisscan.io/address/0x000000000022D473030F116dDEE9F6B43aC78BA3#writeContract and connect your wallet
4. Call `invalidateUnorderedNonces()` with the `wordPos` and `mask` params you got on step 2

Notice that this examples uses gnosis chain for nonce invalidation. If you need to invalidate nonce on some other chain then:

1. Set `RPC_PROVIDER_URL` on step 1 to the desired RPC chain provider
2. On step 3 open UI for the desired chain
