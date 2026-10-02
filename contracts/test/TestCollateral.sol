// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import "@uma/core/contracts/common/implementation/ExpandedERC20.sol";

/// @dev TEST ONLY. An 18-decimal ExpandedERC20 with an open faucet, like the ARCT test token.
contract TestCollateral is ExpandedERC20 {
    constructor() ExpandedERC20("ARCT", "ARCT", 18) {}

    function allocateTo(address to, uint256 value) external {
        _mint(to, value);
    }
}
