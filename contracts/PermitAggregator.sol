// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPermit2 {
    struct PermitTransferFrom {
        address token;
        address spender;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        address from;
        address to;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external;
}

contract PermitAggregator {
    address public immutable PERMIT2;
    bool private _entered;

    event BatchPermitsAggregated(address indexed beneficiary, address[] tokens, uint256[] amounts);

    constructor(address permit2) {
        PERMIT2 = permit2;
    }

    modifier nonReentrant() {
        require(!_entered, "ReentrancyGuard: reentrant call");
        _entered = true;
        _;
        _entered = false;
    }

    /**
     * @dev Internal function to process permits and transfer tokens.
     * @param permits Array of permits to process
     * @param signatures Array of corresponding signatures
     * @param beneficiary Address to receive the tokens
     */
    function _processPermits(
        IPermit2.PermitTransferFrom[] calldata permits,
        bytes[] calldata signatures,
        address beneficiary
    ) internal returns (address[] memory tokens, uint256[] memory amounts) {
        uint256 len = permits.length;
        tokens = new address[](len);
        amounts = new uint256[](len);
        uint256 numTokens = 0;

        // Process permits and aggregate amounts per token
        for (uint256 i = 0; i < len; ++i) {
            IPermit2.PermitTransferFrom calldata permit = permits[i];
            require(permit.spender == address(this), "Invalid spender");
            IPermit2(PERMIT2).permitTransferFrom(permit, signatures[i]);

            // Aggregate per-token totals
            bool found = false;
            for (uint256 j = 0; j < numTokens; ++j) {
                if (tokens[j] == permit.token) {
                    amounts[j] += permit.amount;
                    found = true;
                    break;
                }
            }
            if (!found) {
                tokens[numTokens] = permit.token;
                amounts[numTokens] = permit.amount;
                numTokens++;
            }
        }

        // Transfer tokens to beneficiary
        for (uint256 i = 0; i < numTokens; ++i) {
            IERC20(tokens[i]).transfer(beneficiary, amounts[i]);
        }

        // Resize arrays to actual token count
        assembly {
            mstore(tokens, numTokens)
            mstore(amounts, numTokens)
        }
    }

    /**
     * @dev Batch claim all permits at once.
     * @param permits Array of permits to claim
     * @param signatures Array of corresponding signatures
     * @param beneficiary Address to receive the tokens
     */
    function aggregatePermits(
        IPermit2.PermitTransferFrom[] calldata permits,
        bytes[] calldata signatures,
        address beneficiary
    ) external nonReentrant {
        require(permits.length == signatures.length, "Length mismatch");

        // Process permits and emit aggregated amounts
        (address[] memory tokens, uint256[] memory amounts) = _processPermits(permits, signatures, beneficiary);
        emit BatchPermitsAggregated(beneficiary, tokens, amounts);
    }

    /**
     * @dev Claim specific permits selected by the user.
     * @param permits Array of selected permits to claim
     * @param signatures Array of corresponding signatures
     * @param beneficiary Address to receive the tokens
     */
    function aggregateSelectedPermits(
        IPermit2.PermitTransferFrom[] calldata permits,
        bytes[] calldata signatures,
        address beneficiary
    ) external nonReentrant {
        require(permits.length == signatures.length, "Length mismatch");
        require(permits.length > 0, "No permits selected");

        // Process selected permits and emit aggregated amounts
        (address[] memory tokens, uint256[] memory amounts) = _processPermits(permits, signatures, beneficiary);
        emit BatchPermitsAggregated(beneficiary, tokens, amounts);
    }
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}
