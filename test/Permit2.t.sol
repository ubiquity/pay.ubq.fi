// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "permit2/src/Permit2.sol";
import "permit2/src/interfaces/ISignatureTransfer.sol";

contract Permit2Test is Test {
    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH =
        keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    string testMnemonic = "whale pepper wink eight disease negative renew volume dream forest clean rent";

    // DAI address
    // mainnet: 0x6b175474e89094c44da98b954eedeac495271d0f
    // goerli: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
    IERC20 daiContract = IERC20(0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844);

    // the same address on mainnet and goerli
    Permit2 permit2Contract = Permit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    address botAddress = 0xa701216C86b1fFC1F0E4D592DA4186eD519eaDf9;
    address userAddress = 0x398cb4c0a4821667373DDEB713dd3371c968460b;
    address userAddress2 = 0xe3E77B89CCa2A37d98359A3463822e8e888EB363;

    uint botPrivateKey = vm.deriveKey(testMnemonic, 0);

    function setUp() public {
        // use goerli fork
        vm.selectFork(
            vm.createFork("https://goerli.infura.io/v3/42c7a210df614077867503863d375617")
        );
        // bot allows permit2 to spend 1k DAI (this operation should run only once)
        vm.prank(botAddress);
        daiContract.approve(address(permit2Contract), 1000e18);
    }

    function testPermitTransferFrom() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter's balance before
        uint userBalanceBefore = daiContract.balanceOf(userAddress);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1e18
        });
        vm.prank(userAddress);
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);

        // bounty hunter's balance after
        uint userBalanceAfter = daiContract.balanceOf(userAddress);
        assertEq(userBalanceAfter, userBalanceBefore + 1 ether);
    }

    function testPermitTransferFrom_ShouldRevert_IfNonceHasAlreadyBeenUsed() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1e18
        });
        vm.prank(userAddress);
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);

        // bounty hunter tries to execute the same tx again
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);
    }

    function testPermitTransferFrom_ShouldRevert_IfNonceIsNotValid() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1e18
        });
        permitTransferFromData.nonce = 1;
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);
    }

    function testPermitTransferFrom_ShouldRevert_IfUserModifiedPermitAmount() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1e18
        });
        permitTransferFromData.permitted.amount = 2e18;
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);
    }

    function testPermitTransferFrom_ShouldRevert_IfUserTriesToExecuteNotHisTx() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1e18
        });
        vm.prank(userAddress2);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);
    }

    function testPermitTransferFrom_ShouldSendRewardToAnotherAddress() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        uint user2BalanceBefore = daiContract.balanceOf(userAddress2);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress2,
            requestedAmount: 1e18
        });
        vm.prank(userAddress);
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);

        uint user2BalanceAfter = daiContract.balanceOf(userAddress2);
        assertEq(user2BalanceAfter, user2BalanceBefore + 1 ether);
    }

    function testPermitTransferFrom_ShouldSendHalfOfTheReward() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        uint userBalanceBefore = daiContract.balanceOf(userAddress);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 0.5 ether
        });
        vm.prank(userAddress);
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);

        uint userBalanceAfter = daiContract.balanceOf(userAddress);
        assertEq(userBalanceAfter, userBalanceBefore + 0.5 ether);
    }

    function testPermitTransferFrom_ShouldRevert_IfRequestedAmountIsGreaterThanPermitted() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 2 ether
        });
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);
    }

    function testPermitTransferFrom_ShouldRevert_IfOwnerAddressIsInvalid() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1 ether
        });
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, userAddress, sig);
    }

    function testPermitTransferFrom_ShouldRevert_IfUserTriesToUseSignatureFromAlreadyPaidBounty() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bounty hunter calls permitTransferFrom and transfers reward
        ISignatureTransfer.SignatureTransferDetails memory transferDetails = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1 ether
        });
        vm.prank(userAddress);
        permit2Contract.permitTransferFrom(permitTransferFromData, transferDetails, botAddress, sig);

        // bot (or admin) creates a 2nd signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData2 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 1,
            deadline: block.timestamp
        });

        // bounty hunter calls 2nd permitTransferFrom with the old signature
        ISignatureTransfer.SignatureTransferDetails memory transferDetails2 = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1 ether
        });
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData2, transferDetails2, botAddress, sig);
    }

    function testPermitTransferFrom_ShouldRevert_IfUserTriesToUseSignatureFromNotYetPaidBounty() public {
        // bot (or admin) creates a signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 0,
            deadline: block.timestamp
        });
        bytes memory sig = _signPermit(permitTransferFromData, userAddress, botPrivateKey);

        // bot (or admin) creates a 2nd signature for bounty hunter
        ISignatureTransfer.PermitTransferFrom memory permitTransferFromData2 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(daiContract),
                amount: 1e18
            }),
            nonce: 1,
            deadline: block.timestamp
        });

        // bounty hunter calls 2nd permitTransferFrom with the signature from tx with nonce 0
        ISignatureTransfer.SignatureTransferDetails memory transferDetails2 = ISignatureTransfer.SignatureTransferDetails({
            to: userAddress,
            requestedAmount: 1 ether
        });
        vm.prank(userAddress);
        vm.expectRevert();
        permit2Contract.permitTransferFrom(permitTransferFromData2, transferDetails2, botAddress, sig);
    }

    /**
     * Helper functions
     */

    // Generate a signature for a permit message.
    function _signPermit(
        ISignatureTransfer.PermitTransferFrom memory permit,
        address spender,
        uint256 signerKey
    )
        internal
        view
        returns (bytes memory sig)
    {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(signerKey, _getEIP712Hash(permit, spender));
        return abi.encodePacked(r, s, v);
    }
    
    // Compute the EIP712 hash of the permit object.
    // Normally this would be implemented off-chain.
    function _getEIP712Hash(ISignatureTransfer.PermitTransferFrom memory permit, address spender)
        internal
        view
        returns (bytes32 h)
    {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            permit2Contract.DOMAIN_SEPARATOR(),
            keccak256(abi.encode(
                PERMIT_TRANSFER_FROM_TYPEHASH,
                keccak256(abi.encode(
                    TOKEN_PERMISSIONS_TYPEHASH,
                    permit.permitted.token,
                    permit.permitted.amount
                )),
                spender,
                permit.nonce,
                permit.deadline
            ))
        ));
    }
}
