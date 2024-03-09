# Generate Permit

Tool for generating offline permits for bounty hunters to withdraw their payments.

## How to setup

Create a `.env` file in the project root:

```
# common variables
CHAIN_ID="" # mainnet: 1, goerli: 5
FRONTEND_URL=""
UBIQUIBOT_PRIVATE_KEY=""
RPC_PROVIDER_URL=""
PAYMENT_TOKEN_ADDRESS="" # // DAI address, mainnet: 0x6b175474e89094c44da98b954eedeac495271d0f, goerli: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
# variables depending on spender (bounty hunter)
AMOUNT_IN_ETH="1" # amount in ether, 1 AMOUNT_IN_ETH = 1000000000000000000 WEI
BENEFICIARY_ADDRESS=""
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
2. In the project root run `npx http-server`. Set `env.FRONTEND_URL` to `http://localhost:8080`.
3. Run `npx tsx generate-permit2-url.ts` to generate an offline permit URL.
4. Open the generated permit URL in the `localhost`.
5. Connect the bounty hunter's address.
6. Click the "withdraw" button to get a reward.

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

1. Setup `.env` file with the required env varibales: `NONCE` (nonce number), `NONCE_SIGNER_ADDRESS` (i.e. the bot's wallet) and `RPC_PROVIDER_URL`. For this [permit URL](https://github.com/ubiquity/ubiquity-dollar/issues/643#issuecomment-1607152588) the `.env` file will look like this:

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
