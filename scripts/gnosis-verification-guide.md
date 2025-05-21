# Gnosis Chain Contract Verification Guide

This guide provides instructions for verifying the PermitAggregator contract deployed at `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e` on Gnosis Chain.

## Contract Details

- **Contract Address**: `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e`
- **Contract Name**: PermitAggregator
- **Network**: Gnosis Chain (Chain ID: 100)
- **Explorer**: [Gnosisscan.io](https://gnosisscan.io)

## Verification Methods

### Method 1: Verify via Web UI (Recommended)

The most reliable way to verify the contract is directly through the Gnosisscan web interface:

1. Visit the contract page on Gnosisscan:
   [https://gnosisscan.io/address/0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e](https://gnosisscan.io/address/0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e)

2. Click on the "Contract" tab

3. Click "Verify and Publish"

4. Fill in the verification form with these details:
   - **Compiler Type**: Solidity (Single file)
   - **Compiler Version**: v0.8.20+commit.a1b79de6
   - **License Type**: MIT License (3)
   - **Optimization**: Yes (with 200 runs)
   - **Contract Name**: PermitAggregator
   - **Constructor Arguments**: `000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3`
     (This is the ABI-encoded PERMIT2 address: 0x000000000022D473030F116dDEE9F6B43aC78BA3)
   - **Source Code**: Copy and paste the content from `contracts/PermitAggregator.sol`

5. Complete the verification process by solving the CAPTCHA and submitting the form

### Method 2: API Verification

To verify via the Gnosisscan API, you need a valid API key specifically for Gnosisscan. The standard Etherscan API key may not work with Gnosisscan.

1. Register for a Gnosisscan API key at [https://gnosisscan.io/myapikey](https://gnosisscan.io/myapikey)

2. Use the following API endpoint and parameters:

```
POST https://api.gnosisscan.io/api

Parameters:
apikey=YOUR_GNOSISSCAN_API_KEY
module=contract
action=verifysourcecode
contractaddress=0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e
sourceCode=SOLIDITY_SOURCE_CODE
codeformat=solidity-single-file
contractname=PermitAggregator.sol:PermitAggregator
compilerversion=v0.8.20+commit.a1b79de6
optimizationUsed=1
runs=200
constructorArguements=000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3
```

3. After submitting, you'll receive a GUID. Use this GUID to check the verification status:

```
GET https://api.gnosisscan.io/api?apikey=YOUR_GNOSISSCAN_API_KEY&module=contract&action=checkverifystatus&guid=THE_GUID
```

## Troubleshooting

If verification fails, check the following:

1. **Compiler Version**: Make sure you're using exactly the right compiler version (v0.8.20+commit.a1b79de6)
2. **Optimization Settings**: Verify the optimization is enabled with 200 runs
3. **Constructor Arguments**: Ensure the constructor argument matches exactly the PERMIT2 address used during deployment
4. **Source Code**: The source code must match exactly the code used for deployment, including all comments and whitespace
5. **API Key**: For API verification, you need a valid Gnosisscan-specific API key

## Notes on API Key Usage

According to Etherscan documentation, while their API v2 supports multi-chain access with a single key, some block explorers like Gnosisscan might require separate registration and dedicated API keys. If you're encountering "Invalid API Key" errors when using your Etherscan key with Gnosisscan, consider registering for a Gnosisscan-specific key.

## Contract Deployment Details

The PermitAggregator contract was likely deployed using CREATE2 for a deterministic address, with the PERMIT2 address (0x000000000022D473030F116dDEE9F6B43aC78BA3) as its only constructor argument. This ensures the contract has the same address across multiple chains.
