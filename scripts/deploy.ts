/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// --- Artifact loaders -----------------------------------------------
// UMA infrastructure contracts are deployed from pre-compiled artifacts in @uma/core.
// Only the prediction market and AMM are compiled from our contracts/ directory.

function loadUmaArtifact(contractPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const artifact = require(`@uma/core/artifacts/contracts/${contractPath}`);
  return { abi: artifact.abi, bytecode: artifact.bytecode };
}

const artifacts = {
  Timer: loadUmaArtifact("common/implementation/Timer.sol/Timer.json"),
  Finder: loadUmaArtifact("data-verification-mechanism/implementation/Finder.sol/Finder.json"),
  IdentifierWhitelist: loadUmaArtifact("data-verification-mechanism/implementation/IdentifierWhitelist.sol/IdentifierWhitelist.json"),
  AddressWhitelist: loadUmaArtifact("common/implementation/AddressWhitelist.sol/AddressWhitelist.json"),
  Store: loadUmaArtifact("data-verification-mechanism/implementation/Store.sol/Store.json"),
  TestnetERC20: loadUmaArtifact("common/implementation/TestnetERC20.sol/TestnetERC20.json"),
  MockOracleAncillary: loadUmaArtifact("data-verification-mechanism/test/MockOracleAncillary.sol/MockOracleAncillary.json"),
  OptimisticOracleV2: loadUmaArtifact("optimistic-oracle-v2/implementation/OptimisticOracleV2.sol/OptimisticOracleV2.json"),
};

// --- Configuration --------------------------------------------------

const CONFIG = {
  // Market parameters
  pairName: "BTC100K",
  question: "Will Bitcoin exceed $100,000 before June 1, 2026?",

  // Collateral token (TestnetERC20)
  tokenName: "Arc Test Token",
  tokenSymbol: "ARCT",
  tokenDecimals: 18,

  // Optimistic Oracle parameters
  defaultLiveness: 7200,        // 2 hours - default OO liveness
  marketLiveness: 60,           // 1 minute - market-specific liveness
  proposerReward: ethers.parseEther("10"),    // 10 ARCT
  proposerBond: ethers.parseEther("100"),     // 100 ARCT

  // AMM parameters
  ammFeeBps: 200,                             // 2% fee
  seedLiquidity: ethers.parseEther("1000"),   // 1000 ARCT

  // Deployer allocation
  deployerMint: ethers.parseEther("100000"),  // 100,000 ARCT for deployer
};

// --- Helpers --------------------------------------------------------

async function deployFromArtifact(
  name: string,
  artifact: { abi: unknown[]; bytecode: string },
  args: unknown[],
  signer: ethers.Signer
) {
  console.log(`  Deploying ${name}...`);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  ${name}: ${address}`);
  return contract;
}

async function retryCall<T>(fn: () => Promise<T>, retries = 5, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      if (i === retries - 1 || !(e instanceof Error) || !e.message.includes("BAD_DATA")) throw e;
      console.log(`  View call failed, retrying in ${delayMs / 1000}s... (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}

async function clearPendingTransactions(
  deployer: Awaited<ReturnType<typeof ethers.getSigners>>[0]
) {
  const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  const confirmedNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");

  if (pendingNonce === confirmedNonce) return;

  const stuck = pendingNonce - confirmedNonce;
  console.log(`  Found ${stuck} stuck pending transaction(s). Clearing...`);

  const feeData = await ethers.provider.getFeeData();

  for (let nonce = confirmedNonce; nonce < pendingNonce; nonce++) {
    const tx = await deployer.sendTransaction({
      to: deployer.address,
      value: 0,
      nonce,
      gasPrice: (feeData.gasPrice ?? 0n) * 2n,
    });
    await tx.wait();
    console.log(`  Cleared stuck nonce ${nonce} (tx: ${tx.hash})`);
  }

  console.log("  All pending transactions cleared.\n");
}

function writeEnvFile(envPath: string, vars: Record<string, string>) {
  const envContent: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf-8");
    for (const line of existing.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        envContent[match[1].trim()] = match[2].trim();
      }
    }
  }
  Object.assign(envContent, vars);
  const output = Object.entries(envContent)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
  fs.writeFileSync(envPath, output);
}

// --- Main -----------------------------------------------------------

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account found. Set PRIVATE_KEY in .env.local (64 hex chars, with or without 0x prefix)."
    );
  }
  const [baseSigner] = signers;
  const deployer = new ethers.NonceManager(baseSigner);
  const balance = await ethers.provider.getBalance(baseSigner.address);

  console.log("=== UMA Prediction Market Deployment ===\n");
  console.log("Deployer:", baseSigner.address);
  console.log("Balance:", ethers.formatUnits(balance, 18), "(native gas)\n");

  if (balance === 0n) {
    throw new Error("Deployer has no balance. Fund your wallet from https://faucet.circle.com/");
  }

  // --- Pre-flight: clear any stuck pending transactions -----------

  await clearPendingTransactions(baseSigner);

  // --- Phase 1: Deploy UMA infrastructure -------------------------

  console.log("Phase 1: Deploying UMA infrastructure...\n");

  const timer = await deployFromArtifact("Timer", artifacts.Timer, [], deployer);
  const timerAddr = await timer.getAddress();

  const finder = await deployFromArtifact("Finder", artifacts.Finder, [], deployer);
  const finderAddr = await finder.getAddress();

  const identifierWhitelist = await deployFromArtifact(
    "IdentifierWhitelist", artifacts.IdentifierWhitelist, [], deployer
  );
  const iwAddr = await identifierWhitelist.getAddress();

  const addressWhitelist = await deployFromArtifact(
    "AddressWhitelist", artifacts.AddressWhitelist, [], deployer
  );
  const awAddr = await addressWhitelist.getAddress();

  // Store takes FixedPoint.Unsigned tuples: { rawValue: 0 }
  const store = await deployFromArtifact(
    "Store", artifacts.Store, [[0], [0], timerAddr], deployer
  );
  const storeAddr = await store.getAddress();

  const testnetERC20 = await deployFromArtifact(
    "TestnetERC20 (ARCT)", artifacts.TestnetERC20,
    [CONFIG.tokenName, CONFIG.tokenSymbol, CONFIG.tokenDecimals], deployer
  );
  const arctAddr = await testnetERC20.getAddress();

  const mockOracle = await deployFromArtifact(
    "MockOracleAncillary", artifacts.MockOracleAncillary,
    [finderAddr, timerAddr], deployer
  );
  const mockOracleAddr = await mockOracle.getAddress();

  const optimisticOracleV2 = await deployFromArtifact(
    "OptimisticOracleV2", artifacts.OptimisticOracleV2,
    [CONFIG.defaultLiveness, finderAddr, timerAddr], deployer
  );
  const ooV2Addr = await optimisticOracleV2.getAddress();

  // --- Phase 2: Wire Finder and whitelists ------------------------

  console.log("\nPhase 2: Wiring UMA infrastructure...\n");

  const b32 = (s: string) => ethers.encodeBytes32String(s);

  console.log("  Registering contracts in Finder...");
  await (await finder.getFunction("changeImplementationAddress")(b32("IdentifierWhitelist"), iwAddr)).wait();
  await (await finder.getFunction("changeImplementationAddress")(b32("CollateralWhitelist"), awAddr)).wait();
  await (await finder.getFunction("changeImplementationAddress")(b32("Store"), storeAddr)).wait();
  await (await finder.getFunction("changeImplementationAddress")(b32("Oracle"), mockOracleAddr)).wait();
  await (await finder.getFunction("changeImplementationAddress")(b32("OptimisticOracleV2"), ooV2Addr)).wait();
  console.log("  Finder wired.");

  console.log("  Whitelisting YES_OR_NO_QUERY identifier...");
  await (await identifierWhitelist.getFunction("addSupportedIdentifier")(b32("YES_OR_NO_QUERY"))).wait();
  console.log("  Identifier whitelisted.");

  console.log("  Whitelisting ARCT as collateral...");
  await (await addressWhitelist.getFunction("addToWhitelist")(arctAddr)).wait();
  console.log("  Collateral whitelisted.");

  // --- Phase 3: Mint ARCT for deployer ----------------------------

  console.log("\nPhase 3: Minting ARCT for deployer...\n");

  await (await testnetERC20.getFunction("allocateTo")(baseSigner.address, CONFIG.deployerMint)).wait();
  console.log(`  Minted ${ethers.formatEther(CONFIG.deployerMint)} ARCT to deployer.`);

  // --- Phase 4: Deploy Prediction Market --------------------------

  console.log("\nPhase 4: Deploying prediction market...\n");

  const customAncillaryData = ethers.toUtf8Bytes(CONFIG.question);

  const marketFactory = await ethers.getContractFactory("EventBasedPredictionMarket", deployer);
  const market = await marketFactory.deploy(
    CONFIG.pairName,
    arctAddr,
    customAncillaryData,
    finderAddr,
    timerAddr,
    CONFIG.proposerReward,
    CONFIG.marketLiveness,
    CONFIG.proposerBond
  );
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log(`  EventBasedPredictionMarket: ${marketAddr}`);

  // Reconnect to base signer for view calls (NonceManager can interfere with static calls).
  // Retry to handle RPC propagation delay after deployment.
  const marketContract = market.connect(baseSigner) as typeof market;
  const longTokenAddr = await retryCall(() => marketContract.longToken());
  const shortTokenAddr = await retryCall(() => marketContract.shortToken());
  console.log(`  Long Token (PLT): ${longTokenAddr}`);
  console.log(`  Short Token (PST): ${shortTokenAddr}`);

  // --- Phase 5: Initialize market ---------------------------------

  console.log("\nPhase 5: Initializing market (requesting price from OO)...\n");

  // Approve proposerReward to market
  await (await testnetERC20.getFunction("approve")(marketAddr, CONFIG.proposerReward)).wait();
  await (await market.initializeMarket()).wait();
  console.log("  Market initialized. OO price request active.");

  // --- Phase 6: Deploy and seed AMM -------------------------------

  console.log("\nPhase 6: Deploying and seeding AMM...\n");

  const ammFactory = await ethers.getContractFactory("PredictionMarketAMM", deployer);
  const amm = await ammFactory.deploy(marketAddr, CONFIG.ammFeeBps);
  await amm.waitForDeployment();
  const ammAddr = await amm.getAddress();
  console.log(`  PredictionMarketAMM: ${ammAddr}`);

  // Approve ARCT to AMM and seed liquidity
  await (await testnetERC20.getFunction("approve")(ammAddr, CONFIG.seedLiquidity)).wait();
  await (await amm.initialize(CONFIG.seedLiquidity)).wait();
  console.log(`  AMM seeded with ${ethers.formatEther(CONFIG.seedLiquidity)} ARCT.`);

  // --- Phase 7: Write .env.local ----------------------------------

  const envPath = path.resolve(__dirname, "../.env.local");
  writeEnvFile(envPath, {
    NEXT_PUBLIC_MARKET_ADDRESS: marketAddr,
    NEXT_PUBLIC_AMM_ADDRESS: ammAddr,
    NEXT_PUBLIC_ARCT_ADDRESS: arctAddr,
    NEXT_PUBLIC_OO_V2_ADDRESS: ooV2Addr,
    NEXT_PUBLIC_FINDER_ADDRESS: finderAddr,
    NEXT_PUBLIC_TIMER_ADDRESS: timerAddr,
    NEXT_PUBLIC_MOCK_ORACLE_ADDRESS: mockOracleAddr,
  });

  // --- Summary ----------------------------------------------------

  console.log("\n=== Deployment Summary ===\n");
  console.log("UMA Infrastructure:");
  console.log(`  Timer:                ${timerAddr}`);
  console.log(`  Finder:               ${finderAddr}`);
  console.log(`  IdentifierWhitelist:  ${iwAddr}`);
  console.log(`  AddressWhitelist:     ${awAddr}`);
  console.log(`  Store:                ${storeAddr}`);
  console.log(`  MockOracleAncillary:  ${mockOracleAddr}`);
  console.log(`  OptimisticOracleV2:   ${ooV2Addr}`);
  console.log("");
  console.log("Tokens:");
  console.log(`  ARCT (collateral):    ${arctAddr}`);
  console.log(`  Long Token (PLT):     ${longTokenAddr}`);
  console.log(`  Short Token (PST):    ${shortTokenAddr}`);
  console.log("");
  console.log("Market:");
  console.log(`  PredictionMarket:     ${marketAddr}`);
  console.log(`  AMM:                  ${ammAddr}`);
  console.log("");
  console.log(`Updated ${envPath} with deployed addresses.`);
  console.log("\nNext steps:");
  console.log("  1. Run 'npm run dev' to start the frontend.");
  console.log("  2. Connect your wallet and mint ARCT tokens (the UI has a faucet button).");
  console.log("  3. Buy/sell positions via the AMM.");
  console.log("  4. To resolve: propose a price to the OO, wait for liveness, then settle.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
