// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import 'forge-std/Script.sol';
import 'forge-std/console.sol';
import "permit2/src/Permit2.sol";

contract GetInvalidateNonceParams is Script {
    // the same address on mainnet and gnosis
    Permit2 permit2Contract = Permit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    function run() external {
        uint nonce = vm.envUint('NONCE');
        string memory rpcUrl = vm.envString('RPC_PROVIDER_URL');
        address from = vm.envAddress('NONCE_SIGNER_ADDRESS');

        vm.createSelectFork(rpcUrl);
        
        bool isNonceUsed = _isNonceUsed(from, nonce);
        console.log('Is nonce used:', isNonceUsed);

        (uint wordPos, uint mask) = _getParamsForNonceInvalidation(from, nonce);
        console.log('--------------------');
        console.log('Params for nonce invalidation via invalidateUnorderedNonces()');
        console.log('wordPos:', wordPos);
        console.log('mask:', mask);
    }

    // Checks whether a permit nonce is used
    function _isNonceUsed(address from, uint nonce) internal returns (bool) {
        // find word position (first 248 bits of nonce)
        uint wordPos = uint248(nonce >> 8);
        // find bit position in bitmap
        uint bitPos = uint8(nonce);
        // prepare a mask for target bit
        uint256 bit = 1 << bitPos;
        // get bitmap with a flipped bit
        uint sourceBitmap = permit2Contract.nonceBitmap(from, wordPos);
        uint256 flipped = sourceBitmap ^= bit;
        // check if any bit has been updated
        return flipped & bit == 0;
    }

    // Returns params to be used in "SignatureTransfer.invalidateUnorderedNonces()"
    function _getParamsForNonceInvalidation(address from, uint nonce) internal returns(uint256 wordPos, uint256 mask) {
        wordPos = uint248(nonce >> 8);
        uint bitPos = uint8(nonce);
        uint256 bit = 1 << bitPos;
        uint sourceBitmap = permit2Contract.nonceBitmap(from, wordPos);
        mask = sourceBitmap | bit;
    }
}
