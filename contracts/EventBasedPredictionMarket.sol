// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@uma/core/contracts/common/implementation/ExpandedERC20.sol";
import "@uma/core/contracts/common/implementation/Testable.sol";
import "@uma/core/contracts/common/implementation/AddressWhitelist.sol";
import "@uma/core/contracts/data-verification-mechanism/implementation/Constants.sol";

import "@uma/core/contracts/optimistic-oracle-v2/interfaces/OptimisticOracleV2Interface.sol";
import "@uma/core/contracts/data-verification-mechanism/interfaces/IdentifierWhitelistInterface.sol";

/**
 * @title EventBasedPredictionMarket
 * @notice A binary YES/NO prediction market that uses UMA's Optimistic Oracle V2 for trustless resolution.
 *
 * Lifecycle:
 *   1. Deploy with a question (customAncillaryData), collateral token, and Finder address.
 *   2. Call initializeMarket() to request a price from the Optimistic Oracle (caller pays proposerReward).
 *   3. Users call create() to mint Long (YES) + Short (NO) token pairs, backed 1:1 by collateral.
 *   4. Anyone can propose a resolution price via the OO. After the liveness period, the market settles.
 *   5. If disputed, the OO escalates to UMA's DVM for arbitration and re-requests the price.
 *   6. Once settled, users call settle() to redeem tokens for collateral based on the outcome.
 *
 * Resolution values:
 *   - 1e18 (YES): Long tokens worth 1 collateral each, Short tokens worth 0.
 *   - 0    (NO):  Short tokens worth 1 collateral each, Long tokens worth 0.
 *   - 5e17 (Undetermined): Each token worth 0.5 collateral.
 */
contract EventBasedPredictionMarket is Testable {
    using SafeERC20 for ExpandedERC20;

    /***************************************************
     *  EVENT BASED PREDICTION MARKET DATA STRUCTURES  *
     ***************************************************/
    bool public priceRequested;
    bool public receivedSettlementPrice;

    uint256 public requestTimestamp;
    string public pairName;

    // Number between 0 and 1e18 to allocate collateral between long & short tokens at redemption.
    // 0 entitles each short to 1e18 and each long to 0. 1e18 makes each long worth 1e18 and short 0.
    uint256 public settlementPrice;

    bytes32 public priceIdentifier = "YES_OR_NO_QUERY";

    // Price returned from the Optimistic Oracle at settlement time.
    int256 public expiryPrice;

    // External contract interfaces.
    ExpandedERC20 public collateralToken;
    ExpandedIERC20 public longToken;
    ExpandedIERC20 public shortToken;
    FinderInterface public finder;

    // Optimistic Oracle customization parameters.
    bytes public customAncillaryData;
    uint256 public proposerReward;
    uint256 public optimisticOracleLivenessTime;
    uint256 public optimisticOracleProposerBond;

    /****************************************
     *                EVENTS                *
     ****************************************/

    event TokensCreated(address indexed sponsor, uint256 indexed collateralUsed, uint256 indexed tokensMinted);
    event TokensRedeemed(address indexed sponsor, uint256 indexed collateralReturned, uint256 indexed tokensRedeemed);
    event PositionSettled(address indexed sponsor, uint256 collateralReturned, uint256 longTokens, uint256 shortTokens);
    event MarketInitialized(uint256 requestTimestamp);
    event PriceDisputed(uint256 oldTimestamp, uint256 newTimestamp);

    /****************************************
     *               MODIFIERS              *
     ****************************************/

    modifier requestInitialized() {
        require(priceRequested, "Price not requested");
        _;
    }

    /**
     * @notice Construct the EventBasedPredictionMarket.
     * @param _pairName Name of the long/short pair tokens (e.g. "BTC100K").
     * @param _collateralToken Collateral token used to back position tokens. Must be whitelisted.
     * @param _customAncillaryData The market question encoded as UTF-8 bytes.
     * @param _finder DVM Finder to discover other UMA ecosystem contracts.
     * @param _timerAddress Timer for testing time-dependent logic. Set to 0x0 in production.
     * @param _proposerReward Reward paid to the OO proposer on successful resolution.
     * @param _optimisticOracleLivenessTime Seconds the proposal must remain undisputed.
     * @param _optimisticOracleProposerBond Bond amount the proposer must stake.
     */
    constructor(
        string memory _pairName,
        ExpandedERC20 _collateralToken,
        bytes memory _customAncillaryData,
        FinderInterface _finder,
        address _timerAddress,
        uint256 _proposerReward,
        uint256 _optimisticOracleLivenessTime,
        uint256 _optimisticOracleProposerBond
    ) Testable(_timerAddress) {
        finder = _finder;

        require(_getIdentifierWhitelist().isIdentifierSupported(priceIdentifier), "Identifier not registered");
        require(_getAddressWhitelist().isOnWhitelist(address(_collateralToken)), "Unsupported collateral type");

        collateralToken = _collateralToken;
        customAncillaryData = _customAncillaryData;
        pairName = _pairName;
        proposerReward = _proposerReward;
        optimisticOracleLivenessTime = _optimisticOracleLivenessTime;
        optimisticOracleProposerBond = _optimisticOracleProposerBond;

        requestTimestamp = getCurrentTime();

        longToken = new ExpandedERC20(string(abi.encodePacked(_pairName, " Long Token")), "PLT", 18);
        shortToken = new ExpandedERC20(string(abi.encodePacked(_pairName, " Short Token")), "PST", 18);

        longToken.addMinter(address(this));
        shortToken.addMinter(address(this));
        longToken.addBurner(address(this));
        shortToken.addBurner(address(this));
    }

    /**
     * @notice Initialize the market by requesting a price from the Optimistic Oracle.
     * The caller must hold enough collateral to cover the proposerReward and have approved this contract.
     */
    function initializeMarket() public {
        require(!priceRequested, "Already initialized");

        if (proposerReward > 0) {
            collateralToken.safeTransferFrom(msg.sender, address(this), proposerReward);
        }

        _requestOraclePrice();

        emit MarketInitialized(requestTimestamp);
    }

    /**
     * @notice Callback: called by the Optimistic Oracle when a price settles (liveness expired without dispute).
     * @param identifier The price identifier (must be YES_OR_NO_QUERY).
     * @param timestamp The request timestamp.
     * @param ancillaryData The ancillary data (must match customAncillaryData).
     * @param price The resolved price: 1e18 = YES, 0 = NO, 5e17 = Undetermined.
     */
    function priceSettled(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        int256 price
    ) external {
        OptimisticOracleV2Interface optimisticOracle = getOptimisticOracle();
        require(msg.sender == address(optimisticOracle), "Not authorized");
        require(identifier == priceIdentifier, "Wrong identifier");
        require(keccak256(ancillaryData) == keccak256(customAncillaryData), "Wrong ancillary data");

        // Only process if this is for the current request (ignore stale callbacks).
        if (timestamp != requestTimestamp) return;

        expiryPrice = price;

        if (price >= 1e18) {
            settlementPrice = 1e18;
        } else if (price == 5e17) {
            settlementPrice = 5e17;
        } else {
            settlementPrice = 0;
        }

        receivedSettlementPrice = true;
    }

    /**
     * @notice Callback: called by the Optimistic Oracle when a proposed price is disputed.
     * Re-requests the price with a fresh timestamp so the DVM can arbitrate.
     * @param identifier The price identifier.
     * @param timestamp The request timestamp.
     * @param ancillaryData The ancillary data.
     * @param refund The proposer reward refunded to this contract.
     */
    function priceDisputed(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        uint256 refund
    ) external {
        OptimisticOracleV2Interface optimisticOracle = getOptimisticOracle();
        require(msg.sender == address(optimisticOracle), "Not authorized");
        require(timestamp == requestTimestamp, "Wrong timestamp");
        require(identifier == priceIdentifier, "Wrong identifier");
        require(keccak256(ancillaryData) == keccak256(customAncillaryData), "Wrong ancillary data");
        require(refund == proposerReward, "Wrong refund amount");

        uint256 oldTimestamp = requestTimestamp;
        requestTimestamp = getCurrentTime();
        _requestOraclePrice();

        emit PriceDisputed(oldTimestamp, requestTimestamp);
    }

    /****************************************
     *          POSITION FUNCTIONS          *
     ****************************************/

    /**
     * @notice Create a pair of Long + Short tokens by depositing collateral (1:1 ratio).
     * @param tokensToCreate Number of token pairs to mint.
     */
    function create(uint256 tokensToCreate) public requestInitialized {
        collateralToken.safeTransferFrom(msg.sender, address(this), tokensToCreate);
        require(longToken.mint(msg.sender, tokensToCreate));
        require(shortToken.mint(msg.sender, tokensToCreate));
        emit TokensCreated(msg.sender, tokensToCreate, tokensToCreate);
    }

    /**
     * @notice Redeem equal pairs of Long + Short tokens for collateral (1:1, pre-settlement).
     * @param tokensToRedeem Number of token pairs to burn.
     */
    function redeem(uint256 tokensToRedeem) public {
        require(longToken.burnFrom(msg.sender, tokensToRedeem));
        require(shortToken.burnFrom(msg.sender, tokensToRedeem));
        collateralToken.safeTransfer(msg.sender, tokensToRedeem);
        emit TokensRedeemed(msg.sender, tokensToRedeem, tokensToRedeem);
    }

    /**
     * @notice Settle tokens for collateral after market resolution.
     * @param longTokensToRedeem Number of Long tokens to settle.
     * @param shortTokensToRedeem Number of Short tokens to settle.
     * @return collateralReturned Total collateral returned.
     */
    function settle(
        uint256 longTokensToRedeem,
        uint256 shortTokensToRedeem
    ) public returns (uint256 collateralReturned) {
        require(receivedSettlementPrice, "Price not yet resolved");

        require(longToken.burnFrom(msg.sender, longTokensToRedeem));
        require(shortToken.burnFrom(msg.sender, shortTokensToRedeem));

        uint256 longCollateralRedeemed = (longTokensToRedeem * settlementPrice) / 1e18;
        uint256 shortCollateralRedeemed = (shortTokensToRedeem * (1e18 - settlementPrice)) / 1e18;

        collateralReturned = longCollateralRedeemed + shortCollateralRedeemed;
        collateralToken.safeTransfer(msg.sender, collateralReturned);

        emit PositionSettled(msg.sender, collateralReturned, longTokensToRedeem, shortTokensToRedeem);
    }

    /****************************************
     *          INTERNAL FUNCTIONS          *
     ****************************************/

    /**
     * @notice Request a price from the Optimistic Oracle with event-based mode and callbacks enabled.
     */
    function _requestOraclePrice() internal {
        OptimisticOracleV2Interface optimisticOracle = getOptimisticOracle();

        collateralToken.safeApprove(address(optimisticOracle), proposerReward);

        optimisticOracle.requestPrice(
            priceIdentifier,
            requestTimestamp,
            customAncillaryData,
            collateralToken,
            proposerReward
        );

        optimisticOracle.setCustomLiveness(
            priceIdentifier,
            requestTimestamp,
            customAncillaryData,
            optimisticOracleLivenessTime
        );

        optimisticOracle.setBond(
            priceIdentifier,
            requestTimestamp,
            customAncillaryData,
            optimisticOracleProposerBond
        );

        // Event-based mode: DVM uses proposal timestamp rather than request timestamp on dispute.
        optimisticOracle.setEventBased(priceIdentifier, requestTimestamp, customAncillaryData);

        // Enable priceDisputed and priceSettled callbacks (not priceProposed).
        optimisticOracle.setCallbacks(priceIdentifier, requestTimestamp, customAncillaryData, false, true, true);

        priceRequested = true;
    }

    /**
     * @notice Get the Optimistic Oracle V2 instance from the Finder.
     */
    function getOptimisticOracle() public view returns (OptimisticOracleV2Interface) {
        return OptimisticOracleV2Interface(
            finder.getImplementationAddress(OracleInterfaces.OptimisticOracleV2)
        );
    }

    function _getIdentifierWhitelist() internal view returns (IdentifierWhitelistInterface) {
        return IdentifierWhitelistInterface(
            finder.getImplementationAddress(OracleInterfaces.IdentifierWhitelist)
        );
    }

    function _getAddressWhitelist() internal view returns (AddressWhitelist) {
        return AddressWhitelist(
            finder.getImplementationAddress(OracleInterfaces.CollateralWhitelist)
        );
    }
}
