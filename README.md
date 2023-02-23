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
