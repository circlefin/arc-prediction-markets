import { ethers } from "hardhat";
import { expect } from "chai";

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

describe("PredictionMarketAMM Vulnerability Test", function () {
  let timer: any;
  let finder: any;
  let identifierWhitelist: any;
  let addressWhitelist: any;
  let store: any;
  let testnetERC20: any;
  let mockOracle: any;
  let ooV2: any;
  let market: any;
  let amm: any;

  let deployer: any;
  let user: any;

  const pairName = "BTC100K";
  const question = "Will Bitcoin exceed $100,000 before June 1, 2026?";
  const proposerReward = ethers.parseEther("10");
  const proposerBond = ethers.parseEther("100");
  const marketLiveness = 60;
  const ammFeeBps = 0; // Set to 0 to clearly show structural math bug without fee noise
  const seedLiquidity = ethers.parseEther("1000");

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    user = signers[1];

    // Deploy UMA infra
    const timerFactory = new ethers.ContractFactory(artifacts.Timer.abi, artifacts.Timer.bytecode, deployer);
    timer = await timerFactory.deploy();
    await timer.waitForDeployment();
    const timerAddr = await timer.getAddress();

    const finderFactory = new ethers.ContractFactory(artifacts.Finder.abi, artifacts.Finder.bytecode, deployer);
    finder = await finderFactory.deploy();
    await finder.waitForDeployment();
    const finderAddr = await finder.getAddress();

    const iwFactory = new ethers.ContractFactory(artifacts.IdentifierWhitelist.abi, artifacts.IdentifierWhitelist.bytecode, deployer);
    identifierWhitelist = await iwFactory.deploy();
    await identifierWhitelist.waitForDeployment();
    const iwAddr = await identifierWhitelist.getAddress();

    const awFactory = new ethers.ContractFactory(artifacts.AddressWhitelist.abi, artifacts.AddressWhitelist.bytecode, deployer);
    addressWhitelist = await awFactory.deploy();
    await addressWhitelist.waitForDeployment();
    const awAddr = await addressWhitelist.getAddress();

    const storeFactory = new ethers.ContractFactory(artifacts.Store.abi, artifacts.Store.bytecode, deployer);
    store = await storeFactory.deploy([0], [0], timerAddr);
    await store.waitForDeployment();
    const storeAddr = await store.getAddress();

    const erc20Factory = new ethers.ContractFactory(artifacts.TestnetERC20.abi, artifacts.TestnetERC20.bytecode, deployer);
    testnetERC20 = await erc20Factory.deploy("Arc Test Token", "ARCT", 18);
    await testnetERC20.waitForDeployment();
    const arctAddr = await testnetERC20.getAddress();

    const mockOracleFactory = new ethers.ContractFactory(artifacts.MockOracleAncillary.abi, artifacts.MockOracleAncillary.bytecode, deployer);
    mockOracle = await mockOracleFactory.deploy(finderAddr, timerAddr);
    await mockOracle.waitForDeployment();
    const mockOracleAddr = await mockOracle.getAddress();

    const ooFactory = new ethers.ContractFactory(artifacts.OptimisticOracleV2.abi, artifacts.OptimisticOracleV2.bytecode, deployer);
    ooV2 = await ooFactory.deploy(7200, finderAddr, timerAddr);
    await ooV2.waitForDeployment();
    const ooV2Addr = await ooV2.getAddress();

    // Wire Finder
    const b32 = (s: string) => ethers.encodeBytes32String(s);
    await (await finder.changeImplementationAddress(b32("IdentifierWhitelist"), iwAddr)).wait();
    await (await finder.changeImplementationAddress(b32("CollateralWhitelist"), awAddr)).wait();
    await (await finder.changeImplementationAddress(b32("Store"), storeAddr)).wait();
    await (await finder.changeImplementationAddress(b32("Oracle"), mockOracleAddr)).wait();
    await (await finder.changeImplementationAddress(b32("OptimisticOracleV2"), ooV2Addr)).wait();

    // Whitelist
    await (await identifierWhitelist.addSupportedIdentifier(b32("YES_OR_NO_QUERY"))).wait();
    await (await addressWhitelist.addToWhitelist(arctAddr)).wait();

    // Allocate tokens to user & deployer
    await (await testnetERC20.allocateTo(deployer.address, ethers.parseEther("100000"))).wait();
    await (await testnetERC20.allocateTo(user.address, ethers.parseEther("100000"))).wait();

    // Deploy Market
    const customAncillaryData = ethers.toUtf8Bytes(question);
    const marketFactory = await ethers.getContractFactory("EventBasedPredictionMarket", deployer);
    market = await marketFactory.deploy(
      pairName,
      arctAddr,
      customAncillaryData,
      finderAddr,
      timerAddr,
      proposerReward,
      marketLiveness,
      proposerBond
    );
    await market.waitForDeployment();
    const marketAddr = await market.getAddress();

    // Initialize Market
    await (await testnetERC20.approve(marketAddr, proposerReward)).wait();
    await (await market.initializeMarket()).wait();

    // Deploy AMM
    const ammFactory = await ethers.getContractFactory("PredictionMarketAMM", deployer);
    amm = await ammFactory.deploy(marketAddr, ammFeeBps);
    await amm.waitForDeployment();
    const ammAddr = await amm.getAddress();

    // Seed AMM
    await (await testnetERC20.approve(ammAddr, seedLiquidity)).wait();
    await (await amm.initialize(seedLiquidity)).wait();
  });

  it("verifies constant-product invariant is preserved (no arbitrage profit)", async function () {
    const buyUSDC = ethers.parseEther("100"); // User buys with 100 USDC (ARCT)

    // Check reserves before
    const [resYesBefore, resNoBefore] = await amm.getReserves();
    const kBefore = resYesBefore * resNoBefore;
    console.log(`\n--- [0% Fee] Before Trade ---`);
    console.log(`Reserves YES: ${ethers.formatEther(resYesBefore)}`);
    console.log(`Reserves NO:  ${ethers.formatEther(resNoBefore)}`);
    console.log(`Constant K:   ${ethers.formatEther(kBefore)}`);

    // User buys YES
    await (await testnetERC20.connect(user).approve(await amm.getAddress(), buyUSDC)).wait();
    const txBuy = await amm.connect(user).buyYes(buyUSDC);
    await txBuy.wait();

    const userYesBalance = await (await ethers.getContractAt("ExpandedERC20", await market.longToken())).balanceOf(user.address);
    console.log(`\n--- [0% Fee] After Buy YES ---`);
    console.log(`User YES balance: ${ethers.formatEther(userYesBalance)}`);

    const [resYesMid, resNoMid] = await amm.getReserves();
    const kMid = resYesMid * resNoMid;
    console.log(`Reserves YES: ${ethers.formatEther(resYesMid)}`);
    console.log(`Reserves NO:  ${ethers.formatEther(resNoMid)}`);
    console.log(`Constant K:   ${ethers.formatEther(kMid)}`);

    // User sells all YES back
    const longToken = await ethers.getContractAt("ExpandedERC20", await market.longToken());
    await (await longToken.connect(user).approve(await amm.getAddress(), userYesBalance)).wait();
    
    const balanceBeforeSell = await testnetERC20.balanceOf(user.address);
    const txSell = await amm.connect(user).sellYes(userYesBalance);
    await txSell.wait();
    const balanceAfterSell = await testnetERC20.balanceOf(user.address);

    const usdcReceived = balanceAfterSell - balanceBeforeSell;
    console.log(`\n--- [0% Fee] After Sell YES ---`);
    console.log(`User USDC Spent:    ${ethers.formatEther(buyUSDC)}`);
    console.log(`User USDC Received: ${ethers.formatEther(usdcReceived)}`);
    console.log(`Arbitrage Profit:   ${ethers.formatEther(usdcReceived - buyUSDC)}`);

    const [resYesAfter, resNoAfter] = await amm.getReserves();
    const kAfter = resYesAfter * resNoAfter;
    console.log(`Reserves YES: ${ethers.formatEther(resYesAfter)}`);
    console.log(`Reserves NO:  ${ethers.formatEther(resNoAfter)}`);
    console.log(`Constant K:   ${ethers.formatEther(kAfter)}`);

    // With 0% fee and correct math, the user should get exactly the same amount back (minus minor rounding)
    // No arbitrage profit is possible
    expect(usdcReceived - buyUSDC).to.be.closeTo(0n, 100n); // allow minor rounding error up to 100 wei
    
    // Constant K must be preserved (or slightly higher due to division truncation working in favor of the pool)
    expect(kAfter).to.be.greaterThanOrEqual(kBefore);
  });

  it("verifies constant-product invariant increases when 2% fee is active", async function () {
    // Deploy a new AMM with 2% fee
    const ammFactory = await ethers.getContractFactory("PredictionMarketAMM", deployer);
    const amm2 = await ammFactory.deploy(await market.getAddress(), 200); // 200 bps = 2%
    await amm2.waitForDeployment();
    const amm2Addr = await amm2.getAddress();

    // Seed AMM2
    await (await testnetERC20.approve(amm2Addr, seedLiquidity)).wait();
    await (await amm2.initialize(seedLiquidity)).wait();

    const buyUSDC = ethers.parseEther("100");

    const [resYesBefore, resNoBefore] = await amm2.getReserves();
    const kBefore = resYesBefore * resNoBefore;

    // User buys YES
    await (await testnetERC20.connect(user).approve(amm2Addr, buyUSDC)).wait();
    await (await amm2.connect(user).buyYes(buyUSDC)).wait();

    const longToken = await ethers.getContractAt("ExpandedERC20", await market.longToken());
    const userYesBalance = await longToken.balanceOf(user.address);

    // User sells YES back
    await (await longToken.connect(user).approve(amm2Addr, userYesBalance)).wait();
    
    const balanceBeforeSell = await testnetERC20.balanceOf(user.address);
    await (await amm2.connect(user).sellYes(userYesBalance)).wait();
    const balanceAfterSell = await testnetERC20.balanceOf(user.address);

    const usdcReceived = balanceAfterSell - balanceBeforeSell;
    
    const [resYesAfter, resNoAfter] = await amm2.getReserves();
    const kAfter = resYesAfter * resNoAfter;

    console.log(`\n--- [2% Fee] After Roundtrip ---`);
    console.log(`User USDC Spent:    ${ethers.formatEther(buyUSDC)}`);
    console.log(`User USDC Received: ${ethers.formatEther(usdcReceived)}`);
    console.log(`Arbitrage Profit:   ${ethers.formatEther(usdcReceived - buyUSDC)}`);
    console.log(`Constant K Before:  ${ethers.formatEther(kBefore)}`);
    console.log(`Constant K After:   ${ethers.formatEther(kAfter)}`);

    // With a 2% fee, the user should receive less than they spent
    expect(usdcReceived).to.be.lessThan(buyUSDC);

    // Constant K must increase because of the collected fees
    expect(kAfter).to.be.greaterThan(kBefore);
  });
});
