# [pay.ubq.fi](https://pay.ubq.fi)

A vanilla Typescript dapp for claiming Ubiquity task payments. It also includes tools for generating and invalidating permits and can be used to claim both ERC20 and ERC721 tokens.

## How to set up the local testing environment

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
  - Copy and paste into your wallet provider and you should now be able to interact with the locally generated permits.
  - Only account [0] can claim it and only account [1] can invalidate it.

## What to expect

#### Setup

- Using the yarn command setup it's expected that you will have a local blockchain instance spun-up for you. It will be a local shallow copy of the Gnosis blockchain which will allow you to test the permit generation, claiming and invalidation features.

- The permit URL will be generated in the console, ensure you give it enough space to render the full clickable link as it can be quite long and can be deformed if the console is too small.

- So long as you have imported the correct anvil accounts `([0] & [1])` you should be able to claim and invalidate the permit.

#### Claiming

- We use chain id `31337` for local testing and claiming, this is because we want to target `http://localhost:8545` as the RPC provider so that we can read from and push transactions to the local blockchain.

- If we use a real mainnet or testnet chain id, the app will attempt to read values from and send txs to that chain and will not be able to find an allowance or balance for the account who signed the permit (in most cases this will be true)

- The NFT permit works in the same way that the ERC20 permit does, the only difference is that the NFT permit is for ERC721 tokens.

- When you click claim, you are broadcasting a tx to the permit2 contract telling it to transfer the tokens from the signer's account to the beneficiary's account (or the account designated in the permit as being the receiver of the tokens).

- This requires the signer to have signed a permit of value `AMOUNT_IN_ETH` and for the beneficiary. The signer must also have that balance available and have approved the permit2 contract to spend that amount of tokens. Without these conditions being met, the claim will fail. All of these steps are handled for you running the `yarn test:anvil` and `yarn test:fund` scripts.

#### Invalidating

- Invalidating a permit is a way to cancel a permit that has been signed but not yet claimed by the beneficiary.

- The UI allows only the account that signed the permit to be able to invalidate it, this is true at the smart contract level as well.

- A permit signer is the owner of the tokens before they are claimed. When you claim your Ubiquity reward permit, the tokens are being removed from the signer's account (UbiquityDAO) and sent to the beneficiary's account (You) via the `Permit2` smart contract.

- If you are the signer of the permit, you can invalidate it by clicking the invalidate button. This will call the `invalidateUnorderedNonces` function on the `Permit2` smart contract.

#### Gotchas

- MetaMask is considered the default wallet provider when we consider this app, although you can use any wallet provider that you want. The only requirement is that you have the private keys for the anvil accounts [0] & [1] imported into your wallet.

- You will need to ensure that you have the correct network selected in your wallet. If you are using the local blockchain, you will need to add a custom RPC network with the URL `http://localhost:8545` and chain id `31337`.

- Mobile Web3 is not ideal but when testing for mobile you should be using the [MetaMask Mobile Wallet Browser](https://apps.apple.com/us/app/metamask-blockchain-wallet/id1438144202) on either iOS or Android. This is because traditional browsers like Safari and Chrome do not support Web3.

#### Errors

- If you spin-up an `Anvil` instance and go to the UI then claim the permit, you will see the transaction succeed if all is well with setup and env. Now, if you close that instance and spin-up another, you will see the transaction appear to go through but then never succeed or indefinitely hang. This is because you need to go into the settings of your wallet, MetaMask for example, and clear your transaction history/transaction data. [Rivet](https://chromewebstore.google.com/detail/rivet/mobmnpcacgadhkjfelhpemphmmnggnod) is a good tool which can help reduce the need for this fix but can still remain, it is useful for testing but in no way necessary.

- The test suite is not perfect because we spoof MetaMask, so tests will toast errors that are not actually errors. This is because we are not actually connected to a wallet provider, we are just pretending to be. We are able to do this by injecting a `Signer` into the global scope during tests which allows us to sign transactions and interact with the blockchain as if we were connected to a wallet provider.

- If you see that `Allowance` or `Balance` is `0.00` and you are sure the scripts have run successfully, this means that your `.env` is potentially incorrect and the app is reading from the wrong chain. Ensure that you have the correct chain id and RPC provider URL set in your `.env` file and the correct wallet network selected in your wallet provider (The app should handle this for you and prompt you to change network if it doesn't match the chain id in the `.env` file).

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
