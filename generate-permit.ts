// test mnemonic: whale pepper wink eight disease negative renew volume dream forest clean rent

// Address 1: 0xa701216C86b1fFC1F0E4D592DA4186eD519eaDf9
// Address 2: 0x398cb4c0a4821667373DDEB713dd3371c968460b

// Address 1 PK: 3ba514123c22fe4179289b1226900842bbef2f2eb474fc48c094d30dc6163a28
// Address 2 PK: 9d5c47372b05da22e903247b8c1d3e4ab4c3d27983476bcb7a02f2b531bc3bbe

import { ethers, BigNumber } from 'ethers';

// constants set once
const RPC_PROVIDER_URL = 'https://goerli.infura.io/v3/42c7a210df614077867503863d375617';
const DAI_TOKEN_ADDRESS = '0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844'; // mainnet: 0x6b175474e89094c44da98b954eedeac495271d0f, goerli: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
const OWNER_PRIVATE_KEY = '3ba514123c22fe4179289b1226900842bbef2f2eb474fc48c094d30dc6163a28';
const CHAIN_ID = 5; // mainnet: 1, goerli: 5

// constants depening on a spender
const SPENDER_ADDRESS = '0x398cb4c0a4821667373DDEB713dd3371c968460b';
const AMOUNT = ethers.utils.parseUnits('1', 18); // 1 token, NOTICE: DAI allows infinite amount while in other stables (like USDC) you can select the amount to allow

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_PROVIDER_URL)
    const myWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);

    const domainName = 'Dai Stablecoin';
    const domainVersion = '1';

    const DAIContractABI = [
        "function nonces(address owner) view returns (uint256)"
    ];

    const DAITokenContract = new ethers.Contract(DAI_TOKEN_ADDRESS, DAIContractABI, myWallet);
    const currentBlockTimeStamp = (await provider.getBlock('latest')).timestamp;
    const expiry = (BigNumber.from(currentBlockTimeStamp).add(BigNumber.from(100000)));
    const nonce = (await DAITokenContract.nonces(myWallet.address)).toString()
    const allowed = true;

    const domain = {
        name: domainName,
        version: domainVersion,
        chainId: CHAIN_ID,
        verifyingContract: DAITokenContract.address,
    }

    const types = {
        Permit: [
            {
                name: "holder",
                type: "address",
            },
            {
                name: "spender",
                type: "address",
            },
            {
                name: "nonce",
                type: "uint256",
            },
            {
                name: "expiry",
                type: "uint256",
            },
            {
                name: "allowed",
                type: "bool",
            },
        ]
    }

    const message = {
        holder: myWallet.address,
        spender: SPENDER_ADDRESS,
        nonce: Number(nonce),
        expiry: expiry.toString(),
        allowed
    }

    await myWallet._signTypedData(domain, types, message).then((signature) => {
        const pureSig = signature.replace("0x", "")
        const r = Buffer.from(pureSig.substring(0, 64), 'hex')
        const s = Buffer.from(pureSig.substring(64, 128), 'hex')
        const v = Buffer.from((parseInt(pureSig.substring(128, 130), 16)).toString());

        console.log("owner: ", (myWallet.address).toString()),
        console.log("spender: ", SPENDER_ADDRESS.toString()),
        console.log("nonce: ", Number(nonce)),
        console.log("expiry: ", expiry.toString());
        console.log("allowed: ", allowed.toString());
        console.log(`r: 0x${r.toString('hex')},\ns: 0x${s.toString('hex')},\nv: ${v}`)
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});