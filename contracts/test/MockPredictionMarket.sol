// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uma/core/contracts/common/implementation/ExpandedERC20.sol";

/// @dev TEST ONLY. The parts of EventBasedPredictionMarket the AMM depends on, without the
///      UMA oracle infrastructure: collateral-backed Long/Short pairs that mint and redeem 1:1,
///      and a settlement flag the test can flip. Behaviour mirrors the real contract's
///      create(), redeem() and settle().
contract MockPredictionMarket {
    using SafeERC20 for ExpandedERC20;

    ExpandedERC20 public collateralToken;
    ExpandedERC20 public longToken;
    ExpandedERC20 public shortToken;
    bool public priceRequested = true;
    bool public receivedSettlementPrice;
    uint256 public settlementPrice;

    constructor(ExpandedERC20 _collateral) {
        collateralToken = _collateral;
        longToken = new ExpandedERC20("Long", "PLT", 18);
        shortToken = new ExpandedERC20("Short", "PST", 18);
        longToken.addMinter(address(this));
        shortToken.addMinter(address(this));
        longToken.addBurner(address(this));
        shortToken.addBurner(address(this));
    }

    function create(uint256 tokensToCreate) external {
        require(priceRequested, "Price not requested");
        collateralToken.safeTransferFrom(msg.sender, address(this), tokensToCreate);
        require(longToken.mint(msg.sender, tokensToCreate));
        require(shortToken.mint(msg.sender, tokensToCreate));
    }

    function redeem(uint256 tokensToRedeem) external {
        require(longToken.burnFrom(msg.sender, tokensToRedeem));
        require(shortToken.burnFrom(msg.sender, tokensToRedeem));
        collateralToken.safeTransfer(msg.sender, tokensToRedeem);
    }

    function resolve(uint256 price) external {
        receivedSettlementPrice = true;
        settlementPrice = price;
    }

    function settle(uint256 longIn, uint256 shortIn) external returns (uint256 out) {
        require(receivedSettlementPrice, "Price not yet resolved");
        require(longToken.burnFrom(msg.sender, longIn));
        require(shortToken.burnFrom(msg.sender, shortIn));
        out = (longIn * settlementPrice) / 1e18 + (shortIn * (1e18 - settlementPrice)) / 1e18;
        collateralToken.safeTransfer(msg.sender, out);
    }
}
