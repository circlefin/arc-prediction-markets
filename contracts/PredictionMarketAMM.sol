// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@uma/core/contracts/common/implementation/ExpandedERC20.sol";

interface IEventBasedPredictionMarket {
    function collateralToken() external view returns (ExpandedERC20);
    function longToken() external view returns (ExpandedIERC20);
    function shortToken() external view returns (ExpandedIERC20);
    function priceRequested() external view returns (bool);
    function receivedSettlementPrice() external view returns (bool);
    function create(uint256 tokensToCreate) external;
    function redeem(uint256 tokensToRedeem) external;
}

contract PredictionMarketAMM is ReentrancyGuard {
    using SafeERC20 for ExpandedERC20;
    using SafeERC20 for ExpandedIERC20;

    IEventBasedPredictionMarket public market;
    ExpandedERC20 public collateralToken;
    ExpandedIERC20 public longToken;   // Yes token
    ExpandedIERC20 public shortToken;  // No token

    uint256 public reserveYes;
    uint256 public reserveNo;
    uint256 public feeBps; // e.g. 200 = 2%

    bool public initialized;

    event BuyYes(address indexed buyer, uint256 usdcIn, uint256 yesOut);
    event BuyNo(address indexed buyer, uint256 usdcIn, uint256 noOut);
    event SellYes(address indexed seller, uint256 yesIn, uint256 usdcOut);
    event SellNo(address indexed seller, uint256 noIn, uint256 usdcOut);

    constructor(address _market, uint256 _feeBps) {
        require(_feeBps < 10000, "Fee too high");
        market = IEventBasedPredictionMarket(_market);
        collateralToken = market.collateralToken();
        longToken = market.longToken();
        shortToken = market.shortToken();
        feeBps = _feeBps;
    }

    function initialize(uint256 _initialLiquidity) external {
        require(!initialized, "Already initialized");
        require(_initialLiquidity > 0, "Zero liquidity");
        initialized = true;

        // Pull USDC from caller
        collateralToken.safeTransferFrom(msg.sender, address(this), _initialLiquidity);

        // Approve USDC to market and mint pairs
        collateralToken.approve(address(market), type(uint256).max);
        market.create(_initialLiquidity);

        // Approve tokens to market for future redeems
        longToken.approve(address(market), type(uint256).max);
        shortToken.approve(address(market), type(uint256).max);

        // Seed equal reserves
        reserveYes = _initialLiquidity;
        reserveNo = _initialLiquidity;
    }

    modifier whenActive() {
        require(initialized, "Not initialized");
        require(!market.receivedSettlementPrice(), "Market resolved");
        _;
    }

    // --- Buy functions ---------------------------------------

    function buyYes(uint256 usdcAmount) external nonReentrant whenActive returns (uint256 yesOut) {
        require(usdcAmount > 0, "Zero amount");

        // Pull USDC from user
        collateralToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Mint Yes+No pair
        market.create(usdcAmount);

        // The user conceptually adds No tokens to the pool and gets Yes tokens out.
        // Swap: put usdcAmount of No into pool, get Yes out using constant product.
        uint256 effectiveAmount = (usdcAmount * (10000 - feeBps)) / 10000;
        uint256 newReserveNo = reserveNo + effectiveAmount;
        uint256 swapYesOut = reserveYes - (reserveYes * reserveNo) / newReserveNo;

        // Total Yes out = minted Yes + swapped Yes from pool
        yesOut = usdcAmount + swapYesOut;

        // Update reserves
        reserveYes -= swapYesOut;
        reserveNo += usdcAmount; // full amount (fee already taken via less output)

        // Transfer Yes tokens to user
        longToken.safeTransfer(msg.sender, yesOut);

        emit BuyYes(msg.sender, usdcAmount, yesOut);
    }

    function buyNo(uint256 usdcAmount) external nonReentrant whenActive returns (uint256 noOut) {
        require(usdcAmount > 0, "Zero amount");

        collateralToken.safeTransferFrom(msg.sender, address(this), usdcAmount);
        market.create(usdcAmount);

        uint256 effectiveAmount = (usdcAmount * (10000 - feeBps)) / 10000;
        uint256 newReserveYes = reserveYes + effectiveAmount;
        uint256 swapNoOut = reserveNo - (reserveYes * reserveNo) / newReserveYes;

        noOut = usdcAmount + swapNoOut;

        reserveNo -= swapNoOut;
        reserveYes += usdcAmount;

        shortToken.safeTransfer(msg.sender, noOut);

        emit BuyNo(msg.sender, usdcAmount, noOut);
    }

    // --- Sell functions --------------------------------------

    function sellYes(uint256 yesAmount) external nonReentrant whenActive returns (uint256 usdcOut) {
        require(yesAmount > 0, "Zero amount");

        // Pull Yes tokens from user
        longToken.safeTransferFrom(msg.sender, address(this), yesAmount);

        // Calculate USDC output using quadratic solver
        usdcOut = _calcSell(reserveYes, reserveNo, yesAmount);
        require(usdcOut > 0, "Zero output");

        // Update reserves
        reserveYes = reserveYes + yesAmount - usdcOut;
        reserveNo = reserveNo - usdcOut;

        // Redeem usdcOut pairs for USDC
        market.redeem(usdcOut);

        // Transfer USDC to user
        collateralToken.safeTransfer(msg.sender, usdcOut);

        emit SellYes(msg.sender, yesAmount, usdcOut);
    }

    function sellNo(uint256 noAmount) external nonReentrant whenActive returns (uint256 usdcOut) {
        require(noAmount > 0, "Zero amount");

        shortToken.safeTransferFrom(msg.sender, address(this), noAmount);

        // Calculate USDC output using quadratic solver
        usdcOut = _calcSell(reserveNo, reserveYes, noAmount);
        require(usdcOut > 0, "Zero output");

        // Update reserves
        reserveNo = reserveNo + noAmount - usdcOut;
        reserveYes = reserveYes - usdcOut;

        market.redeem(usdcOut);

        collateralToken.safeTransfer(msg.sender, usdcOut);

        emit SellNo(msg.sender, noAmount, usdcOut);
    }

    // --- View functions --------------------------------------

    /// @notice Returns the Yes price in 1e18 fixed point (0 to 1e18)
    function getYesPrice() external view returns (uint256) {
        if (reserveYes + reserveNo == 0) return 5e17; // 50% default
        return (reserveNo * 1e18) / (reserveYes + reserveNo);
    }

    /// @notice Returns the No price in 1e18 fixed point (0 to 1e18)
    function getNoPrice() external view returns (uint256) {
        if (reserveYes + reserveNo == 0) return 5e17;
        return (reserveYes * 1e18) / (reserveYes + reserveNo);
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserveYes, reserveNo);
    }

    /// @notice Preview how many Yes tokens you get for a given USDC input
    function calcBuyYes(uint256 usdcAmount) external view returns (uint256) {
        if (usdcAmount == 0 || reserveYes == 0 || reserveNo == 0) return 0;
        uint256 effectiveAmount = (usdcAmount * (10000 - feeBps)) / 10000;
        uint256 newReserveNo = reserveNo + effectiveAmount;
        uint256 swapYesOut = reserveYes - (reserveYes * reserveNo) / newReserveNo;
        return usdcAmount + swapYesOut;
    }

    /// @notice Preview how many No tokens you get for a given USDC input
    function calcBuyNo(uint256 usdcAmount) external view returns (uint256) {
        if (usdcAmount == 0 || reserveYes == 0 || reserveNo == 0) return 0;
        uint256 effectiveAmount = (usdcAmount * (10000 - feeBps)) / 10000;
        uint256 newReserveYes = reserveYes + effectiveAmount;
        uint256 swapNoOut = reserveNo - (reserveYes * reserveNo) / newReserveYes;
        return usdcAmount + swapNoOut;
    }

    /// @notice Preview how much USDC you get for selling Yes tokens
    function calcSellYes(uint256 yesAmount) external view returns (uint256) {
        return _calcSell(reserveYes, reserveNo, yesAmount);
    }

    /// @notice Preview how much USDC you get for selling No tokens
    function calcSellNo(uint256 noAmount) external view returns (uint256) {
        return _calcSell(reserveNo, reserveYes, noAmount);
    }

    /**
     * @notice Internal helper to calculate the USDC output when selling outcome tokens.
     * Solves the quadratic equation: x^2 - b*x + c = 0
     * where:
     *   b = reserveIn + reserveOut + tokenAmountEff
     *   c = tokenAmountEff * reserveOut
     * The smaller root is: x = (b - sqrt(b^2 - 4*c)) / 2
     */
    function _calcSell(
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 tokenAmount
    ) internal view returns (uint256 usdcOut) {
        if (tokenAmount == 0 || reserveIn == 0 || reserveOut == 0) return 0;

        uint256 tokenAmountEff = (tokenAmount * (10000 - feeBps)) / 10000;

        uint256 b = reserveIn + reserveOut + tokenAmountEff;
        uint256 c = tokenAmountEff * reserveOut;

        // b^2 - 4*c is mathematically guaranteed to be >= 0
        uint256 discriminant = b * b - 4 * c;
        uint256 rootDisc = Math.sqrt(discriminant);

        usdcOut = (b - rootDisc) / 2;
    }
}
