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

// ---------------------------------------------------------------------------------------------------
// refundMode: the first successful emergencyRefund() makes the market terminal (all tokens worth 0.5).
// The Requested-state guard only covers proposals made BEFORE the first refund; these tests cover a
// proposal / dispute that arrives AFTER some holders were already refunded.
// ---------------------------------------------------------------------------------------------------
describe("EventBasedPredictionMarket refundMode (late oracle activity after a refund)", () => {
  const BOND = E(11); // bond 10 + final fee 1
  const T = 72 * H;

  const split = async (ctx, { longTo = "alice", shortTo = "bob" } = {}) => {
    const { alice, usdc, market } = ctx;
    const longTok = await ethers.getContractAt("ExpandedERC20", await market.longToken());
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    await usdc.connect(alice).approve(market.target, E(100));
    await market.connect(alice).create(E(100));
    if (longTo !== "alice") await longTok.connect(alice).transfer(ctx[longTo].address, E(100));
    if (shortTo !== "alice") await shortTok.connect(alice).transfer(ctx[shortTo].address, E(100));
    return { longTok, shortTok };
  };
  const propose = async (ctx, ts, price) => {
    await ctx.usdc.connect(ctx.proposer).approve(ctx.oo.target, BOND);
    return ctx.oo.connect(ctx.proposer).proposePrice(ctx.market.target, IDENT, ts, ctx.ancillary, price);
  };
  const dispute = async (ctx, ts) => {
    await ctx.usdc.connect(ctx.disputer).approve(ctx.oo.target, BOND);
    return ctx.oo.connect(ctx.disputer).disputePrice(ctx.market.target, IDENT, ts, ctx.ancillary);
  };

  it("osr21: refund Long first -> late NO proposal -> OO settle; Bob's Short exits at 0.5 and the pool drains to 0", async () => {
    const ctx = await deploy();
    const { alice, bob, timer, oo, usdc, market, ancillary } = ctx;
    await split(ctx); // Alice: 100 Long, Bob: 100 Short
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(alice).emergencyRefund(E(100), 0);
    expect(await usdc.balanceOf(market.target)).to.equal(E(50));
    expect(await market.refundMode()).to.equal(true);

    await propose(ctx, ts0, 0); // late NO, request was still Requested
    await warpTo(timer, (await now(timer)) + 24 * H + 1);
    await oo.settle(market.target, IDENT, ts0, ancillary); // priceSettled callback: ignored, must not revert
    expect(await market.receivedSettlementPrice()).to.equal(false);
    await expect(market.connect(bob).settle(0, E(100))).to.be.revertedWith("Refund mode: use emergencyRefund()");

    const before = await usdc.balanceOf(bob.address);
    await market.connect(bob).emergencyRefund(0, E(100)); // OO state is now Settled: guard must not apply
    expect((await usdc.balanceOf(bob.address)) - before).to.equal(E(50));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("symmetric: refund Short first -> late YES proposal -> OO settle; Bob's Long exits at 0.5, pool drains to 0", async () => {
    const ctx = await deploy();
    const { alice, bob, timer, oo, usdc, market, ancillary } = ctx;
    await split(ctx, { longTo: "bob", shortTo: "alice" });
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(alice).emergencyRefund(0, E(100));

    await propose(ctx, ts0, E(1));
    await warpTo(timer, (await now(timer)) + 24 * H + 1);
    await oo.settle(market.target, IDENT, ts0, ancillary);
    expect(await market.receivedSettlementPrice()).to.equal(false);

    const before = await usdc.balanceOf(bob.address);
    await market.connect(bob).emergencyRefund(E(100), 0);
    expect((await usdc.balanceOf(bob.address)) - before).to.equal(E(50));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("holders can still exit while the late proposal is pending (Proposed) and after it expires (Expired)", async () => {
    const ctx = await deploy();
    const { alice, bob, owner: carol, timer, oo, usdc, market, ancillary } = ctx;
    const { longTok } = await split(ctx);
    await longTok.connect(alice).transfer(carol.address, E(40));
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(alice).emergencyRefund(E(60), 0);

    await propose(ctx, ts0, E(1));
    expect(await oo.getState(market.target, IDENT, ts0, ancillary)).to.equal(2n); // Proposed
    await market.connect(carol).emergencyRefund(E(40), 0);
    await warpTo(timer, (await now(timer)) + 24 * H + 1);
    expect(await oo.getState(market.target, IDENT, ts0, ancillary)).to.equal(3n); // Expired
    await market.connect(bob).emergencyRefund(0, E(100));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("dispute after refund: priceDisputed and the DVM-resolved priceSettled callbacks do not revert", async () => {
    const ctx = await deploy();
    const { alice, bob, timer, oo, oracle, usdc, market, ancillary } = ctx;
    await split(ctx);
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(alice).emergencyRefund(E(100), 0);

    await propose(ctx, ts0, E(1));
    await dispute(ctx, ts0); // -> priceDisputed (no-op in refundMode)
    expect(Number(await market.requestTimestamp())).to.equal(ts0); // no re-request
    expect(await market.disputeCount()).to.equal(0);

    const [q] = await oracle.getPendingQueries();
    await oracle.pushPrice(q.identifier, q.time, q.ancillaryData, 0);
    await oo.settle(market.target, IDENT, ts0, ancillary); // -> priceSettled (no-op)
    expect(await market.receivedSettlementPrice()).to.equal(false);

    await market.connect(bob).emergencyRefund(0, E(100));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("all holders refund (odd-wei amounts, late proposal in between) -> contract balance is exactly 0", async () => {
    const ctx = await deploy();
    const { alice, bob, owner, timer, oo, usdc, market, ancillary } = ctx;
    const longTok = await ethers.getContractAt("ExpandedERC20", await market.longToken());
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    await usdc.connect(alice).approve(market.target, E(100));
    await usdc.connect(bob).approve(market.target, E(33) + 1n);
    await market.connect(alice).create(E(100));
    await market.connect(bob).create(E(33) + 1n); // odd wei
    await longTok.connect(alice).transfer(owner.address, E(40));
    await shortTok.connect(bob).transfer(owner.address, E(10) + 1n);
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);

    await market.connect(alice).emergencyRefund(E(60), E(100));
    await propose(ctx, ts0, E(1));
    await warpTo(timer, (await now(timer)) + 24 * H + 1);
    await oo.settle(market.target, IDENT, ts0, ancillary);
    await market.connect(bob).emergencyRefund(E(33) + 1n, E(23));
    await market.connect(owner).emergencyRefund(E(40), E(10) + 1n);

    expect(await longTok.totalSupply()).to.equal(0);
    expect(await shortTok.totalSupply()).to.equal(0);
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("matched-pair redeem() still pays 1:1 in refundMode and leaves the remaining holders solvent", async () => {
    const ctx = await deploy();
    const { alice, bob, timer, usdc, market } = ctx;
    const { longTok } = await split(ctx); // Alice: 100 Long, Bob: 100 Short
    await usdc.connect(bob).approve(market.target, E(20));
    await market.connect(bob).create(E(20)); // Bob: 100 Short + 20 Long + 20 Short... pool 120
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(alice).emergencyRefund(E(100), 0); // latch; pool 120 -> 70
    const before = await usdc.balanceOf(bob.address);
    await market.connect(bob).redeem(E(20)); // pair = 0.5 + 0.5
    expect((await usdc.balanceOf(bob.address)) - before).to.equal(E(20));
    await market.connect(bob).emergencyRefund(0, E(120) - E(20));
    expect(await usdc.balanceOf(market.target)).to.equal(0);
    expect(await longTok.totalSupply()).to.equal(0);
  });

  it("emergencyRefund(0,0) cannot latch refundMode", async () => {
    const { bob, timer, market } = await deploy();
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await expect(market.connect(bob).emergencyRefund(0, 0)).to.be.revertedWith("Nothing to refund");
    expect(await market.refundMode()).to.equal(false);
  });

  // ---- re-evaluation on top of ecabb52 -------------------------------------------------------------

  it("latch is impossible while a proposal is Proposed or Disputed (Requested guard): refundMode stays false", async () => {
    const ctx = await deploy();
    const { alice, timer, market, oo, ancillary } = ctx;
    await split(ctx);
    const deadline = Number(await market.settlementDeadline());
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, deadline - 1);
    await propose(ctx, ts0, E(1));
    await warpTo(timer, deadline + 1);
    expect(await oo.getState(market.target, IDENT, ts0, ancillary)).to.equal(2n); // Proposed
    await expect(market.connect(alice).emergencyRefund(E(1), 0)).to.be.revertedWith("Oracle resolution in progress");
    expect(await market.refundMode()).to.equal(false);

    // Disputed: the dispute re-requests (new request is Requested), but the deadline restarts -> still closed.
    await dispute(ctx, ts0);
    expect(await oo.getState(market.target, IDENT, ts0, ancillary)).to.equal(4n); // Disputed
    await expect(market.connect(alice).emergencyRefund(E(1), 0)).to.be.revertedWith("Settlement deadline not reached");
    expect(await market.refundMode()).to.equal(false);
  });

  it("slow DVM (> 72h after a dispute): a 2-wei holder CAN latch refundMode once the re-request has no proposal", async () => {
    const ctx = await deploy();
    const { alice, bob, timer, oo, oracle, usdc, market, ancillary } = ctx;
    await split(ctx);
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, ts0 + 1 * H);
    await propose(ctx, ts0, E(1));
    await dispute(ctx, ts0); // DVM never answers in this test; re-request ts1 has no proposal
    const ts1 = Number(await market.requestTimestamp());
    const dl = Number(await market.settlementDeadline());
    expect(dl).to.equal(ts1 + T);
    await warpTo(timer, dl + 1);
    expect(await oo.getState(market.target, IDENT, ts0, ancillary)).to.equal(4n); // old request still Disputed

    await market.connect(alice).emergencyRefund(2n, 0); // 2 wei Long
    expect(await market.refundMode()).to.equal(true);

    // The old (disputed) request resolving later has no effect on the market: not before the latch either,
    // since priceSettled ignores timestamp != requestTimestamp.
    const [q] = await oracle.getPendingQueries();
    await oracle.pushPrice(q.identifier, q.time, q.ancillaryData, E(1));
    await oo.settle(market.target, IDENT, ts0, ancillary);
    expect(await market.receivedSettlementPrice()).to.equal(false);
    await market.connect(bob).emergencyRefund(0, E(100));
    await market.connect(alice).emergencyRefund(E(100) - 2n, 0);
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });
});

describe("EventBasedPredictionMarket refundMode with proposerReward > 0 (dispute after latch)", () => {
  const BOND = E(11);
  const REWARD = E(5);

  // OO refunds `reward` to the market on dispute (setEventBased enables refundOnDispute). In refundMode
  // priceDisputed() is a no-op, so the market does NOT re-request and the reward stays in its balance.
  const setup = async () => {
    const ctx = await deploy({ reward: REWARD });
    const { alice, bob, usdc, market } = ctx;
    const longTok = await ethers.getContractAt("ExpandedERC20", await market.longToken());
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    await usdc.connect(alice).approve(market.target, E(100));
    await market.connect(alice).create(E(100));
    return { ...ctx, longTok, shortTok };
  };

  it("dispute after latch does not revert; reward comes back to the market; last emergencyRefund exiter takes it", async () => {
    const ctx = await setup();
    const { alice, bob, oo, oracle, usdc, market, ancillary, longTok, shortTok } = ctx;
    // Alice keeps 20 pairs; Bob holds 80 Long + 80 Short.
    await longTok.connect(alice).transfer(bob.address, E(80));
    await shortTok.connect(alice).transfer(bob.address, E(80));
    const { timer } = ctx;
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(bob).emergencyRefund(E(80), E(80)); // pays 80, pool 100 -> 20
    expect(await usdc.balanceOf(market.target)).to.equal(E(20));

    await usdc.connect(ctx.proposer).approve(oo.target, BOND);
    await oo.connect(ctx.proposer).proposePrice(market.target, IDENT, ts0, ancillary, E(1));
    await usdc.connect(ctx.disputer).approve(oo.target, BOND);
    const before = await usdc.balanceOf(market.target);
    await oo.connect(ctx.disputer).disputePrice(market.target, IDENT, ts0, ancillary); // priceDisputed: no-op, no revert
    expect((await usdc.balanceOf(market.target)) - before).to.equal(REWARD); // reward refunded by the OO
    expect(Number(await market.requestTimestamp())).to.equal(ts0); // no re-request
    expect(await market.disputeCount()).to.equal(0);

    const [q] = await oracle.getPendingQueries();
    await oracle.pushPrice(q.identifier, q.time, q.ancillaryData, 0);
    await oo.settle(market.target, IDENT, ts0, ancillary); // priceSettled: no-op, no revert
    expect(await market.receivedSettlementPrice()).to.equal(false);

    // Alice (20 Long + 20 Short) is the last holder: pool is 20 + 5 reward. She exits via emergencyRefund.
    const a0 = await usdc.balanceOf(alice.address);
    await market.connect(alice).emergencyRefund(E(20), E(20));
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(E(20) + REWARD); // 0.5*40 + extra reward
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("all holders can still exit after a post-latch dispute with reward > 0 (three holders; last one takes the reward)", async () => {
    const ctx = await setup();
    const { alice, bob, owner, usdc, market, longTok, shortTok } = ctx;
    await longTok.connect(alice).transfer(bob.address, E(100));
    await shortTok.connect(alice).transfer(owner.address, E(30));
    // Alice keeps 70 Short; Bob 100 Long; owner 30 Short.
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(ctx.timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(bob).emergencyRefund(E(100), 0); // latch; pool 100 -> 50
    await usdc.connect(ctx.proposer).approve(ctx.oo.target, BOND);
    await ctx.oo.connect(ctx.proposer).proposePrice(market.target, IDENT, ts0, ctx.ancillary, 0);
    await usdc.connect(ctx.disputer).approve(ctx.oo.target, BOND);
    await ctx.oo.connect(ctx.disputer).disputePrice(market.target, IDENT, ts0, ctx.ancillary);
    expect(await usdc.balanceOf(market.target)).to.equal(E(50) + REWARD);

    const o0 = await usdc.balanceOf(owner.address);
    await market.connect(owner).emergencyRefund(0, E(30)); // not last: exactly 0.5 each
    expect((await usdc.balanceOf(owner.address)) - o0).to.equal(E(15));
    const a0 = await usdc.balanceOf(alice.address);
    await market.connect(alice).emergencyRefund(0, E(70)); // last: 35 + reward
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(E(35) + REWARD);
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("documented behaviour: if the LAST holder leaves via redeem(), the refunded reward stays stuck in the contract", async () => {
    const ctx = await setup();
    const { alice, bob, usdc, market, longTok, shortTok } = ctx;
    await longTok.connect(alice).transfer(bob.address, E(80));
    await shortTok.connect(alice).transfer(bob.address, E(80)); // Alice keeps 20 pairs
    const ts0 = Number(await market.requestTimestamp());
    await warpTo(ctx.timer, Number(await market.settlementDeadline()) + 1);
    await market.connect(bob).emergencyRefund(E(80), E(80)); // latch; pool 100 -> 20
    await usdc.connect(ctx.proposer).approve(ctx.oo.target, BOND);
    await ctx.oo.connect(ctx.proposer).proposePrice(market.target, IDENT, ts0, ctx.ancillary, E(1));
    await usdc.connect(ctx.disputer).approve(ctx.oo.target, BOND);
    await ctx.oo.connect(ctx.disputer).disputePrice(market.target, IDENT, ts0, ctx.ancillary);
    expect(await usdc.balanceOf(market.target)).to.equal(E(20) + REWARD);

    const a0 = await usdc.balanceOf(alice.address);
    await market.connect(alice).redeem(E(20)); // 1:1, no last-holder sweep in redeem()
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(E(20));
    expect(await longTok.totalSupply()).to.equal(0);
    expect(await shortTok.totalSupply()).to.equal(0);
    expect(await usdc.balanceOf(market.target)).to.equal(REWARD); // stuck: nobody can withdraw it
  });
});

describe("EventBasedPredictionMarket stale-request callbacks and the zero-payout guard", () => {
  const BOND = E(11); // bond 10 + final fee 1

  const setup = async (amount) => {
    const ctx = await deploy();
    const { alice, usdc, market } = ctx;
    const longTok = await ethers.getContractAt("ExpandedERC20", await market.longToken());
    const shortTok = await ethers.getContractAt("ExpandedERC20", await market.shortToken());
    await usdc.connect(alice).approve(market.target, amount);
    await market.connect(alice).create(amount);
    return { ...ctx, longTok, shortTok };
  };
  const pastDeadline = async ({ timer, market }) => warpTo(timer, Number(await market.settlementDeadline()) + 1);

  it("stale request: after a dispute the old request's DVM-resolved priceSettled is ignored; the new request still settles", async () => {
    const ctx = await setup(E(100));
    const { alice, proposer, disputer, timer, oo, oracle, usdc, market, ancillary } = ctx;

    const ts0 = Number(await market.requestTimestamp());
    await warpTo(timer, ts0 + 1 * H);
    await usdc.connect(proposer).approve(oo.target, BOND);
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts0, ancillary, E(1));
    await usdc.connect(disputer).approve(oo.target, BOND);
    await oo.connect(disputer).disputePrice(market.target, IDENT, ts0, ancillary);
    const ts1 = Number(await market.requestTimestamp());
    expect(ts1).to.be.gt(ts0); // priceDisputed re-requested

    // DVM resolves the OLD (disputed) request as NO; settling it fires priceSettled(ts0, NO) with the stale timestamp.
    const [q] = await oracle.getPendingQueries();
    await oracle.pushPrice(q.identifier, q.time, q.ancillaryData, 0);
    await oo.settle(market.target, IDENT, ts0, ancillary); // must not revert

    expect(await market.receivedSettlementPrice()).to.equal(false);
    expect(Number(await market.requestTimestamp())).to.equal(ts1);
    expect(await market.expiryPrice()).to.equal(0);
    expect(await market.settlementPrice()).to.equal(0);
    expect(await market.refundMode()).to.equal(false);

    // The new request is unaffected and resolves normally (YES): Long pays 1:1.
    await usdc.connect(proposer).approve(oo.target, BOND);
    await oo.connect(proposer).proposePrice(market.target, IDENT, ts1, ancillary, E(1));
    await warpTo(timer, (await now(timer)) + 24 * H + 1);
    await oo.settle(market.target, IDENT, ts1, ancillary);
    expect(await market.receivedSettlementPrice()).to.equal(true);
    expect(await market.settlementPrice()).to.equal(E(1));
    const before = await usdc.balanceOf(alice.address);
    await market.connect(alice).settle(E(100), 0);
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(E(100));
  });

  it("1 wei cannot latch (reverts, refundMode stays false); a 2 wei dust holder can, and the others still exit at exactly 0.5", async () => {
    const ctx = await setup(E(100));
    const { alice, bob, proposer: dust, usdc, market, longTok, shortTok } = ctx;
    await longTok.connect(alice).transfer(dust.address, 2n);
    await shortTok.connect(alice).transfer(bob.address, E(100));
    await pastDeadline(ctx);

    await expect(market.connect(dust).emergencyRefund(1n, 0)).to.be.revertedWith("Refund rounds to zero");
    expect(await market.refundMode()).to.equal(false);

    await market.connect(dust).emergencyRefund(2n, 0); // 2 wei -> 1 wei, latches
    expect(await market.refundMode()).to.equal(true);

    const a0 = await usdc.balanceOf(alice.address);
    await market.connect(alice).emergencyRefund(E(100) - 2n, 0);
    expect((await usdc.balanceOf(alice.address)) - a0).to.equal(E(50) - 1n);

    const b0 = await usdc.balanceOf(bob.address);
    await market.connect(bob).emergencyRefund(0, E(100)); // last out: sweep == exactly 0.5 per token
    expect((await usdc.balanceOf(bob.address)) - b0).to.equal(E(50));

    expect(await usdc.balanceOf(market.target)).to.equal(0);
    expect(await longTok.totalSupply()).to.equal(0);
    expect(await shortTok.totalSupply()).to.equal(0);
  });

  it("after latch: a non-final 1 wei exit reverts, but after merging into one holder (2 wei) it can exit as the last one", async () => {
    const ctx = await setup(4n);
    const { alice, bob, proposer: carol, usdc, market, shortTok } = ctx;
    await shortTok.connect(alice).transfer(bob.address, 1n);
    await shortTok.connect(alice).transfer(carol.address, 1n);
    await pastDeadline(ctx);

    await market.connect(alice).emergencyRefund(4n, 2n); // 6 wei -> 3, latches; 1 wei left in the pool
    expect(await market.refundMode()).to.equal(true);
    expect(await usdc.balanceOf(market.target)).to.equal(1n);

    await expect(market.connect(bob).emergencyRefund(0, 1n)).to.be.revertedWith("Refund rounds to zero");
    await shortTok.connect(bob).transfer(carol.address, 1n);

    const c0 = await usdc.balanceOf(carol.address);
    await market.connect(carol).emergencyRefund(0, 2n); // 2 wei -> 1 wei, and it is the last exit
    expect((await usdc.balanceOf(carol.address)) - c0).to.equal(1n);
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });

  it("final 1 wei exit (pre-computed payout 0) is exempt from the guard and sweeps the balance", async () => {
    const ctx = await setup(3n);
    const { alice, bob, usdc, market, shortTok } = ctx;
    await shortTok.connect(alice).transfer(bob.address, 1n);
    await pastDeadline(ctx);

    await market.connect(alice).emergencyRefund(3n, 2n); // 5 wei -> 2, latches; pool 1 wei
    const b0 = await usdc.balanceOf(bob.address);
    await market.connect(bob).emergencyRefund(0, 1n); // pre-computed 0, but last out
    expect((await usdc.balanceOf(bob.address)) - b0).to.equal(1n);
    expect(await usdc.balanceOf(market.target)).to.equal(0);
  });
});
