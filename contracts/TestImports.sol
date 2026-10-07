// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

// Test-only: forces Hardhat to compile the UMA contracts the dispute-flow test deploys.
import "@uma/core/contracts/common/implementation/Timer.sol";
import "@uma/core/contracts/common/implementation/AddressWhitelist.sol";
import "@uma/core/contracts/common/implementation/ExpandedERC20.sol";
import "@uma/core/contracts/data-verification-mechanism/implementation/Finder.sol";
import "@uma/core/contracts/data-verification-mechanism/implementation/IdentifierWhitelist.sol";
import "@uma/core/contracts/data-verification-mechanism/implementation/Store.sol";
import "@uma/core/contracts/data-verification-mechanism/test/MockOracleAncillary.sol";
import "@uma/core/contracts/optimistic-oracle-v2/implementation/OptimisticOracleV2.sol";
