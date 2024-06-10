# Generate Permit

Tool for generating offline permits for bounty hunters to withdraw their payments.

## How to set up

Ensure you have installed [Foundry](https://book.getfoundry.sh/getting-started/installation) in order to use the helper scripts to setup the local testing environment.



Create a `.env` file in the project root:

- These are the default test env settings that allow for easy E2E local setup using the yarn commands. If you want to produce or invalidate real onchain permits you must change the below values to reflect the real permit information such as address, chain id, private key and so on.

```
# common variables
CHAIN_ID="31337" # 1 | 100, 31337 is default for local testing and claiming
FRONTEND_URL="http://localhost:8080"
UBIQUIBOT_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
RPC_PROVIDER_URL="http://127.0.0.1:8545"
PAYMENT_TOKEN_ADDRESS="0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d"
# variables depending on spender (bounty hunter)
AMOUNT_IN_ETH="1" # amount in ether, 1 AMOUNT_IN_ETH = 1000000000000000000 WEI
BENEFICIARY_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
```

## How it works

1. Admin sets `env.AMOUNT_IN_ETH` and `env.BENEFICIARY_ADDRESS` depending on a bounty hunter's reward and address
2. Admin generates an offline permit URL via `npx tsx generate-permit2-url.ts`. Permit URL example:

```
http://localhost:8080?claim=eyJwZXJtaXQiOnsicGVybWl0dGVkIjp7InRva2VuIjoiMHgxMWZFNEI2QUUxM2QyYTYwNTVDOEQ5Y0Y2NWM1NWJhYzMyQjVkODQ0IiwiYW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJub25jZSI6IjQ0NTUxMjc4NTQwNTU0MzM1MDQ2NzU2NDQ3MzM2MjI1ODg5OTE4OTY5MTczODQwNTU0Nzk2NzQ3MzQzMzAwOTg0NzU4MDIyMzY1ODczIiwiZGVhZGxpbmUiOiIxMTU3OTIwODkyMzczMTYxOTU0MjM1NzA5ODUwMDg2ODc5MDc4NTMyNjk5ODQ2NjU2NDA1NjQwMzk0NTc1ODQwMDc5MTMxMjk2Mzk5MzUifSwidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHhjODZhMDU5NzgwMThlMDRkNmVGMmFhNzNFNjlhNzMzQzA2ZDFmODllIiwicmVxdWVzdGVkQW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAwMCJ9LCJvd25lciI6IjB4NTRmNGEzNjQyMkRjOTZkMDg0OTY3NWMxZjBkZDJCOTZEMjc1NThFMiIsInNpZ25hdHVyZSI6IjB4NWI0OTE5MjhmYzI4MzBlMjZiNTViMWUxOWQ3YzVhMmVjNGE2ZmRhYWI1OGFiYjgyOWMwNmYzYzlkNGE4YTc5YjAzYmE2NjlkMDM4YjFmYzg5NjgzYzMyYjBiYTA5MzU2MDRjMGU1MDNjYWE3ZmY2ZWM2MDg2ZWZlYjY2MTY5MjQxYyJ9
```

3. Admin posts offline permit URL in issue comments
4. Bounty hunter opens permit URL, connects wallet and clicks a "withdraw" button to get a payment

## How to test locally

1. Set `.env` variables.
2. Run `yarn test:anvil` in terminal A and `yarn test:fund` in terminal B.
3. Use terminal B to then run `yarn start`.
4. A permit URL for both ERC20 and ERC721 is generated in the terminal.
5. Open the generated permit URL using the link in the console.
6. Connect your wallet. (This requires that you have imported the two anvil accounts [0] & [1] into your wallet.)
7. Either the claim or invalidate button should be visible depending on your connected account.
8. Testing the ERC721 permit is easiest deploying the `nft-rewards` contract from the [repository](https://github.com/ubiquity/nft-rewards)

- Importing the anvil accounts into your wallet:
  - Open your wallet provider and select `import wallet` or `import account`, something to that effect.
  - You can obtain the private keys by simply running the yarn command or just `anvil` and it will list the private keys for you.
  - Copy and paste into your wallet provider and you should now be able to the local permit generated
  - Only account [0] can claim it and only account [1] can invalidate it.

## CloudFlare Setup (GitHub Secrets)

##### CLOUDFLARE_ACCOUNT_ID =

    https://dash.cloudflare.com/***/pages
    https://dash.cloudflare.com/abcd1234/pages
    (Here `abcd1234` is your account ID)

##### CLOUDFLARE_API_TOKEN =

    https://dash.cloudflare.com/profile/api-tokens > Create Token > API token templates > Edit Cloudflare Workers > Use Template
    Account Resources = All Accounts or Target Account
    Zone Resources = All Zones
    (Detailed Instructions: https://developers.cloudflare.com/workers/wrangler/ci-cd/)

##### CLOUDFLARE_ASSET_DIRECTORY =

    static

##### CLOUDFLARE_PROJECT_NAME =

    npm install -g wrangler
    wrangler login
    wrangler pages project create

## How to invalidate a permit2 nonce by example

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
