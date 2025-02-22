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
  BACKEND_URL="" # "" or if you want to work on frontend only, use "https://pay.ubq.fi"
  UBIQUIBOT_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  RPC_PROVIDER_URL="http://127.0.0.1:8545"
  PAYMENT_TOKEN_ADDRESS="0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d"

  # Storing tx data is not required to test locally although you do need to fill these with valid values
  # unless working on this feature specifically you won't need to build a supabase instance
  SUPABASE_URL=https://<yourSupabaseInstance>.supabase.co # used for storing permit tx data
  SUPABASE_ANON_KEY="...." # used for storing permit tx data

  # Variables depending on spender (bounty hunter)
  AMOUNT_IN_ETH="50"
  BENEFICIARY_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

  # Legacy env vars (only used when invalidating **REAL** permits via /scripts/solidity/getInvalidateNonceParams.ts)
  NONCE="0"
  NONCE_SIGNER_ADDRESS="0x"
  ```

3. Update values for wrangler variables to use Reloadly sandbox or production API in the `wrangler.toml` file.

```
[vars]
USE_RELOADLY_SANDBOX = "true"
RELOADLY_API_CLIENT_ID = "xxxxxxxxxxxxxxxxxx"
RELOADLY_API_CLIENT_SECRET = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## Local Testing

1. Set `.env` variables.
2. Run `yarn`
3. Run `yarn test:anvil` in terminal A and `yarn test:fund` in terminal B.
4. In terminal B, run

```
yarn build
yarn start
```

4. A permit URL for both ERC20 and ERC721 will be generated.
5. Open the generated permit URL from the console.
6. Connect your wallet (import anvil accounts [0] & [1] into your wallet).
7. Depending on your connected account, either the claim or invalidate button will be visible. The virtual card section will also display an available virtual card.
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

### Troubleshooting virtual cards

Virtual cards are subject to regulations and are not available for all countries. Moreover, each virtual card is available for specific amounts. If you are unable to see an available virtual card it is either because of your location or the amount of your permit.

If you are not getting an available card, you can perform a few extra steps to get a virtual card for testing purposes. You can set the permit amount `AMOUNT_IN_ETH` to be 50 WXDAI in the `.env` file and mock your location as United States. To set your location to United States, you can follow one of the steps given below:

- Use a USA VPN
- Set your timezone to `Eastern Time (ET) New York` and block the ajax request to `https://ipinfo.io/json` so that your timezone is used to detect your location.

One of these steps should get you a virtual card to try both on Reloadly sandbox and production. Please note that if you are minting a virtual card with a mock location on Reloadly production, you will get a redeem code but you may not able to use the card due to restrictions on the card, and there is no refund or replacement. Use your real location if you want to use the virtual card.

If you are using mainnet with your local environments, you may want to change the `giftCardTreasuryAddress` to a wallet that you own in the file `shared/constants.ts`. It is the wallet where payments for the virtual cards are sent.

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

### Working with frontend only

Following environment variables will help you quickly get started with frontend only. Rest of the environment variables should be specified as described [above](https://github.com/ubiquity/pay.ubq.fi#setup-local-testing-environment).

```
CHAIN_ID="100"
BACKEND_URL="https://pay.ubq.fi"
RPC_PROVIDER_URL="https://rpc.gnosischain.com"
```

In this case, the production deploy of the backend is served to your frontend and you can change things in the frontend.

There are some `/shared` files for frontend & backend. To make sure you didn't break anything in backend, you should occasionally run
`yarn test:unit`
