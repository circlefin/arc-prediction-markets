const { expect } = require("chai");
const { ethers } = require("hardhat");

const E = (n) => ethers.parseUnits(String(n), 18);
const H = 3600;
const IDENT = ethers.encodeBytes32String("YES_OR_NO_QUERY");
const b32 = (s) => ethers.encodeBytes32String(s);

async function deploy({ reward = 0n } = {}) {
  const [owner, alice, bob, proposer, disputer] = await ethers.getSigners();
  const f = (n) => ethers.getContractFactory(n);

  const timer = await (await f("Timer")).deploy();
  const finder = await (await f("Finder")).deploy();
  const idWl = await (await f("IdentifierWhitelist")).deploy();
  const colWl = await (await f("AddressWhitelist")).deploy();
  const store = await (await f("Store")).deploy({ rawValue: 0 }, { rawValue: 0 }, timer.target);
  const oracle = await (await f("MockOracleAncillary")).deploy(finder.target, timer.target);
  const oo = await (await f("OptimisticOracleV2")).deploy(2 * H, finder.target, timer.target);

  const reg = async (name, addr) => finder.changeImplementationAddress(b32(name), addr);
  await reg("IdentifierWhitelist", idWl.target);
  await reg("CollateralWhitelist", colWl.target);
  await reg("Store", store.target);
  await reg("Oracle", oracle.target);
  await reg("OptimisticOracleV2", oo.target);

  const usdc = await (await f("ExpandedERC20")).deploy("USDC", "USDC", 18);
  await usdc.addMember(1, owner.address); // Roles.Minter
  await usdc.mint(owner.address, E(1000));
  await idWl.addSupportedIdentifier(IDENT);
  await colWl.addToWhitelist(usdc.target);
  await store.setFinalFee(usdc.target, { rawValue: E(1) });

  for (const s of [alice, bob, proposer, disputer]) await usdc.mint(s.address, E(1000));

  const ancillary = ethers.toUtf8Bytes("q: will it be above 30C?");
  const BOND = E(10);
  // proposerReward defaults to 0: see the proposerReward > 0 test below for why.
  const market = await (await f("EventBasedPredictionMarket")).deploy(
    "TEST", usdc.target, ancillary, finder.target, timer.target, reward, 24 * H, BOND
  );
  if (reward > 0n) await usdc.connect(owner).approve(market.target, reward);
  await market.initializeMarket();
  return { owner, alice, bob, proposer, disputer, timer, oo, oracle, usdc, market, ancillary };
}

const now = async (timer) => Number(await timer.getCurrentTime());
const warpTo = (timer, t) => timer.setCurrentTime(t);

describe("EventBasedPredictionMarket emergencyRefund vs. disputes", () => {
  it("control: no proposal at all -> emergencyRefund is solvent for a transferred position", async () => {
    const { alice, bob, timer, usdc, market } = await deploy();
    await usdc.connect(alice).approve(market.target, E(100));
    await market.connect(alice).create(E(100));
    await (await ethers.getContractAt("ExpandedERC20", await market.shortToken())).connect(alice).transfer(bob.address, E(100));

    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(alice).emergencyRefund(E(100), 0);
    await market.connect(bob).emergencyRefund(0, E(100));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("dispute at settlementDeadline-1, emergencyRefund, then settle NO: Short holder must still get paid", async () => {
    const { alice, bob, proposer, disputer, timer, oo, usdc, market, ancillary } = await deploy();
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    const BOND = E(11); // bond 10 + final fee 1
    const deadline = Number(await market.settlementDeadline());

    // 100 Long/Short pairs; Alice keeps Long, Short goes to Bob.
    await usdc.connect(alice).approve(market.target, E(100));
    await market.connect(alice).create(E(100));
    await shortTok.connect(alice).transfer(bob.address, E(100));
    expect(await usdc.balanceOf(market.target)).to.equal(E(100));

    // Someone proposes YES shortly before the deadline, then is disputed at deadline-1.
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, deadline - 1 * H);
    await usdc.connect(proposer).approve(oo.target, BOND);
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts0, ancillary, E(1));
    await warpTo(timer, deadline - 1);
    await usdc.connect(disputer).approve(oo.target, BOND);
    await oo.connect(disputer).disputePrice(market.target, IDENT, ts0, ancillary);

    // priceDisputed() re-requested with a fresh timestamp and restarted the settlement window.
    const ts1 = Number(await market.requestTimestamp());
    expect(ts1).to.equal(deadline - 1);
    expect(Number(await market.settlementDeadline())).to.equal(ts1 + Number(await market.SETTLEMENT_TIMEOUT()));

    // (a) Past the ORIGINAL deadline the refund is still closed: the dispute restarted the window.
    await warpTo(timer, deadline + 1);
    await expect(market.connect(alice).emergencyRefund(E(100), 0)).to.be.revertedWith("Settlement deadline not reached");

    // (b) The legitimate re-resolution is now in flight: a NO proposal on the new request just before the
    // restarted deadline. Past that deadline Alice (Long, worthless under NO) must still not be able to take 50.
    const newDeadline = Number(await market.settlementDeadline());
    await warpTo(timer, newDeadline - 1 * H);
    await usdc.connect(proposer).approve(oo.target, BOND);
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts1, ancillary, 0);
    await warpTo(timer, newDeadline + 1);
    await expect(market.connect(alice).emergencyRefund(E(100), 0)).to.be.revertedWith("Oracle resolution in progress");
    expect(await usdc.balanceOf(market.target)).to.equal(E(100));

    // Liveness (24h) expires, the NO price settles into the market.
    await warpTo(timer, newDeadline - 1 * H + 24 * H + 1);
    await oo.settle(market.target, IDENT, ts1, ancillary);
    expect(await market.receivedSettlementPrice()).to.equal(true);
    expect(await market.settlementPrice()).to.equal(0);

    // Bob's 100 Short are worth 1 each under NO and the full 100 is still there.
    const before = await usdc.balanceOf(bob.address);
    await market.connect(bob).settle(0, E(100));
    expect((await usdc.balanceOf(bob.address)) - before).to.equal(E(100));
  });

  it("propose at settlementDeadline-1 (no dispute), emergencyRefund, then settle YES: Long holder must still get paid", async () => {
    const { alice, bob, proposer, timer, oo, usdc, market, ancillary } = await deploy();
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    const deadline = Number(await market.settlementDeadline());

    await usdc.connect(alice).approve(market.target, E(100));
    await market.connect(alice).create(E(100));
    await shortTok.connect(alice).transfer(bob.address, E(100)); // Alice: 100 Long, Bob: 100 Short

    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, deadline - 1);
    await usdc.connect(proposer).approve(oo.target, E(11));
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts0, ancillary, E(1)); // YES, never disputed

    // The proposal is pending (24h liveness) but the deadline has passed: Bob (Short, worthless under YES)
    // must not be able to refund 50 out of the pool.
    await warpTo(timer, deadline + 1);
    await expect(market.connect(bob).emergencyRefund(0, E(100))).to.be.revertedWith("Oracle resolution in progress");
    expect(await usdc.balanceOf(market.target)).to.equal(E(100));

    await warpTo(timer, deadline - 1 + 24 * H + 1);
    await oo.settle(market.target, IDENT, ts0, ancillary);
    expect(await market.settlementPrice()).to.equal(E(1));

    // Alice's 100 Long are worth 1 each under YES.
    const before = await usdc.balanceOf(alice.address);
    await market.connect(alice).settle(E(100), 0);
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(E(100));
  });

  it("proposerReward > 0: a dispute goes through (setEventBased() turns on refundOnDispute, so refund == reward)", async () => {
    const { proposer, disputer, timer, oo, usdc, market, ancillary } = await deploy({ reward: E(5) });
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, ts0 + 1 * H); // the re-request needs a fresh timestamp, otherwise requestPrice: Invalid
    await usdc.connect(proposer).approve(oo.target, E(11));
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts0, ancillary, E(1));
    await usdc.connect(disputer).approve(oo.target, E(11));
    await oo.connect(disputer).disputePrice(market.target, IDENT, ts0, ancillary);
    expect(Number(await market.requestTimestamp())).to.equal(ts0 + 1 * H);
  });

  const setupSplit = async (ctx) => {
    const { alice, bob, usdc, market } = ctx;
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    await usdc.connect(alice).approve(market.target, E(100));
    await market.connect(alice).create(E(100));
    await shortTok.connect(alice).transfer(bob.address, E(100)); // Alice: 100 Long, Bob: 100 Short
  };

  it("Expired proposal (liveness over, nobody called settle yet) must also block emergencyRefund", async () => {
    const ctx = await deploy();
    const { alice, bob, proposer, timer, oo, usdc, market, ancillary } = ctx;
    await setupSplit(ctx);
    const deadline = Number(await market.settlementDeadline());
    const ts0 = Number(await market.requestTimestamp());

    await warpTo(timer, ts0 + 1 * H);
    await usdc.connect(proposer).approve(oo.target, E(11));
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts0, ancillary, 0); // NO, undisputed
    await warpTo(timer, deadline + 1); // liveness (24h) is long over: state is Expired, not yet settled in the market
    expect(await oo.getState(market.target, IDENT, ts0, ancillary)).to.equal(3n); // Expired
    expect(await market.receivedSettlementPrice()).to.equal(false);

    // Alice's Long is worth 0 under the pending NO price. Refunding must not be possible here.
    await expect(market.connect(alice).emergencyRefund(E(100), 0)).to.be.reverted;
    await oo.settle(market.target, IDENT, ts0, ancillary);
    await market.connect(bob).settle(0, E(100)); // Bob still gets the full 100
  });

  it("once the price is Settled the existing receivedSettlementPrice check already blocks emergencyRefund", async () => {
    const ctx = await deploy();
    const { alice, proposer, timer, oo, usdc, market, ancillary } = ctx;
    await setupSplit(ctx);
    const deadline = Number(await market.settlementDeadline());
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, ts0 + 1 * H);
    await usdc.connect(proposer).approve(oo.target, E(11));
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts0, ancillary, 0);
    await warpTo(timer, deadline + 1);
    await oo.settle(market.target, IDENT, ts0, ancillary);
    await expect(market.connect(alice).emergencyRefund(E(100), 0)).to.be.revertedWith("Price already resolved, use settle()");
  });

  it("repeated disputes extend settlementDeadline only up to the cap, then it stays fixed", async () => {
    const ctx = await deploy();
    const { proposer, disputer, timer, oo, usdc, market, ancillary } = ctx;
    const CAP = 3;
    const T = Number(await market.SETTLEMENT_TIMEOUT());
    let d = Number(await market.settlementDeadline());
    let last = d;
    for (let i = 1; i <= CAP + 2; i++) {
      const ts = Number(await market.requestTimestamp());
      const t = Math.max(ts, last) + 1 * H;
      await warpTo(timer, t);
      await usdc.connect(proposer).approve(oo.target, E(11));
      await oo.connect(proposer).proposePrice(market.target, IDENT, ts, ancillary, E(1));
      await usdc.connect(disputer).approve(oo.target, E(11));
      await oo.connect(disputer).disputePrice(market.target, IDENT, ts, ancillary); // must never revert
      const now = Number(await market.requestTimestamp());
      const dl = Number(await market.settlementDeadline());
      if (i <= CAP) expect(dl).to.equal(now + T, `dispute ${i} extends`);
      else expect(dl).to.equal(last, `dispute ${i} is past the cap`);
      last = dl;
    }
  });

  it("emergencyRefund is still reachable: no proposal after the cap-th dispute -> both holders can exit", async () => {
    const ctx = await deploy();
    const { alice, bob, proposer, disputer, timer, oo, usdc, market, ancillary } = ctx;
    await setupSplit(ctx);
    for (let i = 1; i <= 4; i++) {
      const ts = Number(await market.requestTimestamp());
      await warpTo(timer, ts + 1 * H);
      await usdc.connect(proposer).approve(oo.target, E(11));
      await oo.connect(proposer).proposePrice(market.target, IDENT, ts, ancillary, E(1));
      await usdc.connect(disputer).approve(oo.target, E(11));
      await oo.connect(disputer).disputePrice(market.target, IDENT, ts, ancillary);
    }
    const dl = Number(await market.settlementDeadline());
    await warpTo(timer, dl + 1); // the latest request has no proposal (state Requested)
    await market.connect(alice).emergencyRefund(E(100), 0);
    await market.connect(bob).emergencyRefund(0, E(100));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });
});
