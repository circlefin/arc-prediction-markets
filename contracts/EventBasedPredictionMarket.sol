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
 *   7. If nobody proposes/resolves a price within SETTLEMENT_TIMEOUT of initialization, any token
 *      holder can call emergencyRefund() to redeem at a neutral 0.5/0.5 split instead of waiting
 *      indefinitely on the Optimistic Oracle. Each dispute (up to MAX_DISPUTE_EXTENSIONS of them)
 *      restarts that SETTLEMENT_TIMEOUT window, and emergencyRefund() stays closed for as long as
 *      the current oracle request has a proposal or dispute in progress, because a 0.5/0.5 refund
 *      paid out before a real YES/NO price lands would leave the market under-collateralized.
 *      The first successful emergencyRefund() latches refundMode: from then on the market is terminal,
 *      every remaining token (Long or Short) is worth exactly 0.5 collateral, and any OO proposal,
 *      dispute or settlement arriving afterwards is ignored (see priceSettled / priceDisputed).
 *      DESIGN (intentional): once settlementDeadline has passed and receivedSettlementPrice is false
 *      (and the current request has no proposal in progress), ANY token holder — even one holding a
 *      dust amount — can force the market into neutral 0.5/0.5 settlement. The only extra guard is that
 *      a refund must pay out something: a call whose payout rounds to zero reverts with
 *      "Refund rounds to zero", except the final exit, which sweeps the remaining balance.
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

    // Timestamp after which emergencyRefund() becomes callable if the OO still hasn't settled a price.
    uint256 public settlementDeadline;
    uint256 public constant SETTLEMENT_TIMEOUT = 72 hours;

    // Disputes that still push settlementDeadline back. Past this, a dispute is still processed
    // (priceDisputed() must never revert or it would block the OO's dispute flow) but no longer
    // extends the deadline, so a stream of disputes cannot keep emergencyRefund() closed forever.
    uint256 public constant MAX_DISPUTE_EXTENSIONS = 3;
    uint256 public disputeCount;

    // Latched by the first successful emergencyRefund(). Once true the market is terminal: all tokens
    // redeem at 0.5 and the Optimistic Oracle result (even if proposed/settled later) is ignored.
    // The Requested-state guard in emergencyRefund() only covers proposals that exist *before* the first
    // refund; a proposal made afterwards on the still-Requested request would otherwise be applied to a
    // pool that no longer matches the token supply, leaving the remaining holders under-collateralised.
    bool public refundMode;

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
    event EmergencyRefund(address indexed sponsor, uint256 collateralReturned, uint256 longTokens, uint256 shortTokens);

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
        settlementDeadline = getCurrentTime() + SETTLEMENT_TIMEOUT;

        emit MarketInitialized(requestTimestamp);
    }

    /**
     * @notice Callback: called by the Optimistic Oracle when a price settles (liveness expired without dispute).
     * In refundMode this is a deliberate no-op that must never revert: OptimisticOracleV2._settle calls this
     * callback without try/catch, so a revert here would make the OO request unsettleable.
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

        // Refund mode: the oracle result no longer matters. Return right after the caller check (before the
        // identifier / ancillary checks) so the genuine OO callback can never revert here.
        if (refundMode) return;

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
     * In refundMode this is a no-op that must never revert (the OO calls it without try/catch, so a revert
     * would block the dispute); no new request is made since the oracle result is ignored.
     */
    function priceDisputed(
        bytes32 identifier,
        uint256 timestamp,
        bytes memory ancillaryData,
        uint256 refund
    ) external {
        OptimisticOracleV2Interface optimisticOracle = getOptimisticOracle();
        require(msg.sender == address(optimisticOracle), "Not authorized");

        // Refund mode: ignore the dispute (no re-request, no deadline / disputeCount change).
        if (refundMode) return;

        require(timestamp == requestTimestamp, "Wrong timestamp");
        require(identifier == priceIdentifier, "Wrong identifier");
        require(keccak256(ancillaryData) == keccak256(customAncillaryData), "Wrong ancillary data");
        require(refund == proposerReward, "Wrong refund amount");

        uint256 oldTimestamp = requestTimestamp;
        requestTimestamp = getCurrentTime();
        _requestOraclePrice();

        // A dispute restarts the settlement window so DVM arbitration is not raced by emergencyRefund().
        // Bounded by MAX_DISPUTE_EXTENSIONS; beyond that the deadline stays where it is (no revert).
        if (disputeCount < MAX_DISPUTE_EXTENSIONS) {
            disputeCount++;
            settlementDeadline = getCurrentTime() + SETTLEMENT_TIMEOUT;
        }

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
     * Remains correct in refundMode: a pair is worth 0.5 + 0.5 = 1 there too, and burning one Long and one Short
     * for 1 collateral keeps the invariant (longSupply + shortSupply) * 0.5 == collateral balance intact.
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
        require(!refundMode, "Refund mode: use emergencyRefund()");
        require(receivedSettlementPrice, "Price not yet resolved");

        require(longToken.burnFrom(msg.sender, longTokensToRedeem));
        require(shortToken.burnFrom(msg.sender, shortTokensToRedeem));

        uint256 longCollateralRedeemed = (longTokensToRedeem * settlementPrice) / 1e18;
        uint256 shortCollateralRedeemed = (shortTokensToRedeem * (1e18 - settlementPrice)) / 1e18;

        collateralReturned = longCollateralRedeemed + shortCollateralRedeemed;
        collateralToken.safeTransfer(msg.sender, collateralReturned);

        emit PositionSettled(msg.sender, collateralReturned, longTokensToRedeem, shortTokensToRedeem);
    }

    /**
     * @notice Emergency exit for token holders when the Optimistic Oracle never resolves a price.
     * Callable only after settlementDeadline (SETTLEMENT_TIMEOUT after initializeMarket(), restarted by
     * each of the first MAX_DISPUTE_EXTENSIONS disputes) with no settlement price received, and only
     * while the current oracle request is still in the Requested state, i.e. no proposal is pending,
     * expired-but-unsettled, or disputed. Otherwise a real YES/NO price could still arrive after
     * refunds were paid at 0.5 per token, leaving the market short of collateral for the winning side.
     * Pays out at a neutral 0.5/0.5 split (same math as an "Undetermined" OO result), since the true
     * outcome was never established. Directional (one-sided) holders are otherwise unable to exit —
     * redeem() only works for matched Long+Short pairs.
     * The first successful call latches refundMode, permanently switching the market to the 0.5/0.5 split;
     * the oracle-state guard above applies only to that first call. Once latched, any later OO proposal
     * (which moves the request out of Requested, and eventually to Settled) is ignored, so the guard is
     * skipped and the remaining holders can always exit.
     * Solvency: before the first refund collateral == longSupply == shortSupply, so
     * (longSupply + shortSupply) * 0.5 == collateral. Every refund burns n tokens and pays n / 2, preserving
     * that invariant. When the last token is burned, the remaining balance (rounding dust) is paid out too.
     * In refundMode any collateral beyond (longSupply + shortSupply) * 0.5 — rounding dust, a proposer reward
     * refunded by the OO on a post-latch dispute, or collateral donated directly to this contract — is
     * taken by whoever makes the last emergencyRefund() (the call that burns the final token). If the last
     * holder leaves through redeem() instead, that excess stays in the contract.
     *
     * Permissionless by design: after the deadline, with no price received and no proposal in progress, ANY
     * holder (even of a dust amount) can latch refundMode and thereby force neutral 0.5/0.5 settlement.
     * The payout is pre-computed before anything is burned or latched and must be non-zero: a refund that
     * rounds to zero (e.g. 1 wei of tokens) reverts with "Refund rounds to zero", so it cannot latch
     * refundMode for free. Exception: the call that burns the final outstanding tokens may pre-compute 0
     * because it sweeps the remaining contract balance. That exemption can never be the latching call:
     * before the first latch Long and Short supply are equal, so burning the whole supply means >= 2
     * tokens and a pre-computed payout >= 1. After a latch, a non-final holder of 1 wei cannot exit alone
     * but can transfer the token to another holder and exit as part of a larger amount.
     * @param longTokensToRedeem Number of Long tokens to redeem.
     * @param shortTokensToRedeem Number of Short tokens to redeem.
     * @return collateralReturned Total collateral returned.
     */
    function emergencyRefund(
        uint256 longTokensToRedeem,
        uint256 shortTokensToRedeem
    ) public requestInitialized returns (uint256 collateralReturned) {
        require(getCurrentTime() > settlementDeadline, "Settlement deadline not reached");
        require(!receivedSettlementPrice, "Price already resolved, use settle()");
        // A no-op call must not be able to latch refundMode (that would cancel the oracle outcome for everyone).
        require(longTokensToRedeem + shortTokensToRedeem > 0, "Nothing to refund");

        // Undetermined-equivalent split: every token (long or short) is worth exactly 0.5 collateral,
        // since no outcome was ever established. Computed before latching/burning so a zero payout is rejected.
        collateralReturned = ((longTokensToRedeem + shortTokensToRedeem) * 5e17) / 1e18;

        // The final exit sweeps the whole remaining balance below, so it is exempt from the zero-payout check.
        bool lastExit = longToken.totalSupply() == longTokensToRedeem &&
            shortToken.totalSupply() == shortTokensToRedeem;
        require(collateralReturned > 0 || lastExit, "Refund rounds to zero");

        if (!refundMode) {
            require(
                getOptimisticOracle().getState(address(this), priceIdentifier, requestTimestamp, customAncillaryData) ==
                    OptimisticOracleV2Interface.State.Requested,
                "Oracle resolution in progress"
            );
            // Latch: from this point the oracle result is ignored.
            refundMode = true;
        }

        require(longToken.burnFrom(msg.sender, longTokensToRedeem));
        require(shortToken.burnFrom(msg.sender, shortTokensToRedeem));

        // Last holder out takes whatever is left (rounding dust from odd-wei redemptions).
        if (lastExit) {
            collateralReturned = collateralToken.balanceOf(address(this));
        }
        collateralToken.safeTransfer(msg.sender, collateralReturned);

        emit EmergencyRefund(msg.sender, collateralReturned, longTokensToRedeem, shortTokensToRedeem);
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
