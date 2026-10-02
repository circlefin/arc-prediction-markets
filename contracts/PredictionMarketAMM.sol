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
    function settle(uint256 longTokensToRedeem, uint256 shortTokensToRedeem) external returns (uint256);
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

    /// @notice The account that deployed the AMM. Only it may seed the pool and, after the
    ///         market resolves, withdraw the liquidity and fees the pool holds.
    address public immutable deployer;

    event Initialized(address indexed deployer, uint256 liquidity);
    event LiquidityWithdrawn(address indexed to, uint256 collateralOut);
    event BuyYes(address indexed buyer, uint256 usdcIn, uint256 yesOut);
    event BuyNo(address indexed buyer, uint256 usdcIn, uint256 noOut);
    event SellYes(address indexed seller, uint256 yesIn, uint256 usdcOut);
    event SellNo(address indexed seller, uint256 noIn, uint256 usdcOut);

    constructor(address _market, uint256 _feeBps) {
        require(_feeBps < 10000, "Fee too high");
        deployer = msg.sender;
        market = IEventBasedPredictionMarket(_market);
        collateralToken = market.collateralToken();
        longToken = market.longToken();
        shortToken = market.shortToken();
        feeBps = _feeBps;
    }

    /// @dev Restricted to the deployer. It used to be open: anyone could call it first with
    ///      1 wei, permanently seeding the pool with dust so every trader faced enormous price
    ///      impact, and the real seed then reverted with "Already initialized".
    function initialize(uint256 _initialLiquidity) external {
        require(msg.sender == deployer, "Only deployer");
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

        emit Initialized(msg.sender, _initialLiquidity);
    }

    modifier whenActive() {
        require(initialized, "Not initialized");
        require(!market.receivedSettlementPrice(), "Market resolved");
        _;
    }

    // --- Buy functions ---------------------------------------
    //
    // Every trade takes a minimum-output argument. Without one, a trade executes at whatever
    // price the pool has when it is mined, so anyone who can order transactions can sandwich
    // it and keep the difference. The frontend passes the quote it showed, less a tolerance.

    function buyYes(uint256 usdcAmount, uint256 minYesOut)
        external
        nonReentrant
        whenActive
        returns (uint256 yesOut)
    {
        require(usdcAmount > 0, "Zero amount");
        uint256 kBefore = reserveYes * reserveNo;

        // Pull USDC from user and mint Yes+No pairs
        collateralToken.safeTransferFrom(msg.sender, address(this), usdcAmount);
        market.create(usdcAmount);

        // Total Yes out = the minted Yes + Yes swapped out of the pool for the No it gains.
        uint256 swapYesOut = _swapOut(usdcAmount, reserveNo, reserveYes);
        yesOut = usdcAmount + swapYesOut;
        require(yesOut >= minYesOut, "Slippage: too little Yes");

        reserveYes -= swapYesOut;
        reserveNo += usdcAmount; // full amount; the fee stays in the pool as extra reserve
        require(reserveYes * reserveNo >= kBefore, "Invariant broken");

        longToken.safeTransfer(msg.sender, yesOut);

        emit BuyYes(msg.sender, usdcAmount, yesOut);
    }

    function buyNo(uint256 usdcAmount, uint256 minNoOut)
        external
        nonReentrant
        whenActive
        returns (uint256 noOut)
    {
        require(usdcAmount > 0, "Zero amount");
        uint256 kBefore = reserveYes * reserveNo;

        collateralToken.safeTransferFrom(msg.sender, address(this), usdcAmount);
        market.create(usdcAmount);

        uint256 swapNoOut = _swapOut(usdcAmount, reserveYes, reserveNo);
        noOut = usdcAmount + swapNoOut;
        require(noOut >= minNoOut, "Slippage: too little No");

        reserveNo -= swapNoOut;
        reserveYes += usdcAmount;
        require(reserveYes * reserveNo >= kBefore, "Invariant broken");

        shortToken.safeTransfer(msg.sender, noOut);

        emit BuyNo(msg.sender, usdcAmount, noOut);
    }

    // --- Sell functions --------------------------------------

    function sellYes(uint256 yesAmount, uint256 minUsdcOut)
        external
        nonReentrant
        whenActive
        returns (uint256 usdcOut)
    {
        require(yesAmount > 0, "Zero amount");
        uint256 kBefore = reserveYes * reserveNo;

        longToken.safeTransferFrom(msg.sender, address(this), yesAmount);

        usdcOut = _sellQuote(yesAmount, reserveYes, reserveNo);
        require(usdcOut > 0, "Amount too small");
        require(usdcOut >= minUsdcOut, "Slippage: too little USDC");

        // The pool takes the Yes, then burns `usdcOut` Yes+No pairs to pay the seller.
        reserveYes = reserveYes + yesAmount - usdcOut;
        reserveNo -= usdcOut;
        require(reserveYes * reserveNo >= kBefore, "Invariant broken");

        market.redeem(usdcOut);
        collateralToken.safeTransfer(msg.sender, usdcOut);

        emit SellYes(msg.sender, yesAmount, usdcOut);
    }

    function sellNo(uint256 noAmount, uint256 minUsdcOut)
        external
        nonReentrant
        whenActive
        returns (uint256 usdcOut)
    {
        require(noAmount > 0, "Zero amount");
        uint256 kBefore = reserveYes * reserveNo;

        shortToken.safeTransferFrom(msg.sender, address(this), noAmount);

        usdcOut = _sellQuote(noAmount, reserveNo, reserveYes);
        require(usdcOut > 0, "Amount too small");
        require(usdcOut >= minUsdcOut, "Slippage: too little USDC");

        reserveNo = reserveNo + noAmount - usdcOut;
        reserveYes -= usdcOut;
        require(reserveYes * reserveNo >= kBefore, "Invariant broken");

        market.redeem(usdcOut);
        collateralToken.safeTransfer(msg.sender, usdcOut);

        emit SellNo(msg.sender, noAmount, usdcOut);
    }

    // --- Liquidity -------------------------------------------

    /// @notice After the market resolves, the deployer can withdraw what the pool holds: the
    ///         seed liquidity plus the fees traders paid. Trading stops at resolution and the
    ///         pool had no way to redeem its own tokens, so all of it used to be stuck forever.
    function withdrawLiquidity() external nonReentrant returns (uint256 collateralOut) {
        require(msg.sender == deployer, "Only deployer");
        require(initialized, "Not initialized");
        require(market.receivedSettlementPrice(), "Market not resolved");

        uint256 longBalance = longToken.balanceOf(address(this));
        uint256 shortBalance = shortToken.balanceOf(address(this));
        reserveYes = 0;
        reserveNo = 0;

        if (longBalance > 0 || shortBalance > 0) {
            market.settle(longBalance, shortBalance);
        }

        collateralOut = collateralToken.balanceOf(address(this));
        if (collateralOut > 0) collateralToken.safeTransfer(msg.sender, collateralOut);

        emit LiquidityWithdrawn(msg.sender, collateralOut);
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
        return usdcAmount + _swapOut(usdcAmount, reserveNo, reserveYes);
    }

    /// @notice Preview how many No tokens you get for a given USDC input
    function calcBuyNo(uint256 usdcAmount) external view returns (uint256) {
        if (usdcAmount == 0 || reserveYes == 0 || reserveNo == 0) return 0;
        return usdcAmount + _swapOut(usdcAmount, reserveYes, reserveNo);
    }

    /// @notice Preview how much USDC you get for selling Yes tokens
    function calcSellYes(uint256 yesAmount) external view returns (uint256) {
        if (yesAmount == 0 || reserveYes == 0 || reserveNo == 0) return 0;
        return _sellQuote(yesAmount, reserveYes, reserveNo);
    }

    /// @notice Preview how much USDC you get for selling No tokens
    function calcSellNo(uint256 noAmount) external view returns (uint256) {
        if (noAmount == 0 || reserveYes == 0 || reserveNo == 0) return 0;
        return _sellQuote(noAmount, reserveNo, reserveYes);
    }

    // --- Math ------------------------------------------------

    /// @dev Constant-product swap: put `amountIn` (fee taken off) into `reserveIn`, take the
    ///      output out of `reserveOut`. Rounded so the POOL keeps any fraction of a wei: the
    ///      old floor division rounded the trader's output up.
    function _swapOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private view returns (uint256) {
        uint256 effective = (amountIn * (10000 - feeBps)) / 10000;
        uint256 newReserveIn = reserveIn + effective;
        return reserveOut - Math.ceilDiv(reserveIn * reserveOut, newReserveIn);
    }

    /// @dev USDC paid for selling `amountIn` of one outcome token.
    ///
    ///      The pool receives the tokens and pays by redeeming `r` Yes+No PAIRS, so afterwards
    ///      it holds (reserveSell + amountIn - r) and (reserveOther - r). Keeping the
    ///      constant product means solving
    ///          (reserveSell + effective - r) * (reserveOther - r) = reserveSell * reserveOther
    ///      for r, a quadratic:
    ///          r = (S - sqrt(S^2 - 4 * effective * reserveOther)) / 2,   S = reserveSell + effective + reserveOther
    ///
    ///      The previous code instead swapped the whole amount into the other token and paid
    ///      that much, ignoring that one of the pair being redeemed is the token just sold. At a
    ///      50/50 price it paid about 1 USDC for a token worth 0.5, so buying then selling was a
    ///      risk-free profit that drained the pool.
    ///
    ///      Rounded down (sqrt rounded up) so the pool never pays a wei too much.
    function _sellQuote(uint256 amountIn, uint256 reserveSell, uint256 reserveOther) private view returns (uint256) {
        uint256 effective = (amountIn * (10000 - feeBps)) / 10000;
        uint256 s = reserveSell + effective + reserveOther;
        uint256 discriminant = s * s - 4 * effective * reserveOther;
        uint256 root = Math.sqrt(discriminant, Math.Rounding.Up);
        if (root >= s) return 0;
        uint256 out = (s - root) / 2;
        return out >= reserveOther ? reserveOther - 1 : out;
    }
}
