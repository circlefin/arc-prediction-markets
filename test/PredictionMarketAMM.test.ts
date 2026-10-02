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

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const E = (n: number | string) => ethers.parseEther(String(n));
const SEED = E(1000);
const FEE_BPS = 200n;

async function deploy(seed = true) {
  const [deployer, alice, bob, mallory] = await ethers.getSigners();
  const collateral = await ethers.deployContract("TestCollateral");
  const market = await ethers.deployContract("MockPredictionMarket", [await collateral.getAddress()]);
  const amm = await ethers.deployContract("PredictionMarketAMM", [await market.getAddress(), FEE_BPS]);
  const ammAddress = await amm.getAddress();
  const long = await ethers.getContractAt("TestCollateral", await market.longToken());
  const short = await ethers.getContractAt("TestCollateral", await market.shortToken());

  for (const user of [deployer, alice, bob, mallory]) {
    await collateral.allocateTo(user.address, E(1_000_000));
    await collateral.connect(user).approve(ammAddress, ethers.MaxUint256);
    await long.connect(user).approve(ammAddress, ethers.MaxUint256);
    await short.connect(user).approve(ammAddress, ethers.MaxUint256);
    await long.connect(user).approve(await market.getAddress(), ethers.MaxUint256);
    await short.connect(user).approve(await market.getAddress(), ethers.MaxUint256);
  }
  if (seed) await amm.initialize(SEED);
  return { deployer, alice, bob, mallory, collateral, market, amm, ammAddress, long, short };
}

type Fixture = Awaited<ReturnType<typeof deploy>>;

const reverts = (promise: Promise<unknown>, reason: RegExp | string) =>
  assert.rejects(promise, (error: Error) => {
    assert.match(error.message, typeof reason === "string" ? new RegExp(reason) : reason);
    return true;
  });

/** The pool's accounting must always match the tokens it really holds. */
async function assertPoolConsistent(f: Fixture) {
  const [reserveYes, reserveNo] = await f.amm.getReserves();
  assert.equal(await f.long.balanceOf(f.ammAddress), reserveYes, "Yes reserve != Yes balance");
  assert.equal(await f.short.balanceOf(f.ammAddress), reserveNo, "No reserve != No balance");
}

/** Every unit of collateral in the market backs exactly one Yes+No pair. */
async function assertMarketSolvent(f: Fixture) {
  assert.equal(
    await f.collateral.balanceOf(await f.market.getAddress()),
    await f.long.totalSupply(),
    "collateral != pairs outstanding"
  );
  assert.equal(await f.long.totalSupply(), await f.short.totalSupply());
}

describe("PredictionMarketAMM", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await deploy();
  });

  describe("initialize", () => {
    it("seeds equal reserves", async () => {
      const [yes, no] = await f.amm.getReserves();
      assert.equal(yes, SEED);
      assert.equal(no, SEED);
      assert.equal(await f.amm.getYesPrice(), E("0.5"));
      await assertPoolConsistent(f);
    });

    it("can only be called by the deployer (anyone could seed the pool with 1 wei)", async () => {
      const fresh = await deploy(false);
      await reverts(fresh.amm.connect(fresh.mallory).initialize(1), "Only deployer");
      await fresh.amm.initialize(SEED); // the real seed still works
      assert.equal((await fresh.amm.getReserves())[0], SEED);
    });

    it("cannot be called twice, and rejects zero liquidity", async () => {
      await reverts(f.amm.initialize(SEED), "Already initialized");
      const fresh = await deploy(false);
      await reverts(fresh.amm.initialize(0), "Zero liquidity");
    });

    it("blocks trading until it has been called", async () => {
      const fresh = await deploy(false);
      await reverts(fresh.amm.connect(fresh.alice).buyYes(E(1), 0), "Not initialized");
    });
  });

  describe("buying", () => {
    it("gives more tokens than the price implies only by the pool's swap, and moves the price", async () => {
      const quote = await f.amm.calcBuyYes(E(100));
      await f.amm.connect(f.alice).buyYes(E(100), 0);
      assert.equal(await f.long.balanceOf(f.alice.address), quote);
      assert.ok((await f.amm.getYesPrice()) > E("0.5"), "buying Yes should raise the Yes price");
      await assertPoolConsistent(f);
      await assertMarketSolvent(f);
    });

    it("the preview matches what the trade delivers, on both sides", async () => {
      const yesQuote = await f.amm.calcBuyYes(E(7));
      const noQuote = await f.amm.calcBuyNo(E(9));
      assert.equal(await f.amm.connect(f.alice).buyYes.staticCall(E(7), 0), yesQuote);
      assert.equal(await f.amm.connect(f.alice).buyNo.staticCall(E(9), 0), noQuote);
    });

    it("rejects zero", async () => {
      await reverts(f.amm.connect(f.alice).buyYes(0, 0), "Zero amount");
      await reverts(f.amm.connect(f.alice).buyNo(0, 0), "Zero amount");
    });
  });

  describe("selling", () => {
    it("pays roughly the token's price, not 2x it (the old code paid ~1 USDC for a 0.5 token)", async () => {
      await f.amm.connect(f.alice).buyYes(E(100), 0);
      const yes = await f.long.balanceOf(f.alice.address);
      const price = await f.amm.getYesPrice(); // ~0.5 after a 100 buy on a 1000 pool
      const out = await f.amm.calcSellYes(E(1));
      // Selling 1 Yes should return about `price` USDC, never more than 1 and never above price.
      assert.ok(out < E(1), `sold 1 Yes for ${ethers.formatEther(out)} (must be < 1)`);
      assert.ok(out <= (price * E(1)) / E(1), `paid ${ethers.formatEther(out)} > price ${ethers.formatEther(price)}`);
      assert.ok(yes > 0n);
    });

    it("the preview matches what the trade pays, on both sides", async () => {
      await f.amm.connect(f.alice).buyYes(E(50), 0);
      await f.amm.connect(f.alice).buyNo(E(50), 0);
      const yesQuote = await f.amm.calcSellYes(E(10));
      const noQuote = await f.amm.calcSellNo(E(10));
      assert.equal(await f.amm.connect(f.alice).sellYes.staticCall(E(10), 0), yesQuote);
      assert.equal(await f.amm.connect(f.alice).sellNo.staticCall(E(10), 0), noQuote);
    });

    it("refuses a dust sale that would pay nothing, without taking the tokens", async () => {
      await f.amm.connect(f.alice).buyYes(E(10), 0);
      const before = await f.long.balanceOf(f.alice.address);
      await reverts(f.amm.connect(f.alice).sellYes(1, 0), "Amount too small");
      assert.equal(await f.long.balanceOf(f.alice.address), before);
    });

    it("rejects zero and selling tokens you do not hold", async () => {
      await reverts(f.amm.connect(f.alice).sellYes(0, 0), "Zero amount");
      await reverts(f.amm.connect(f.alice).sellYes(E(1), 0), /.+/);
    });
  });

  describe("the round-trip drain (buy then sell for a profit)", () => {
    for (const [name, buy, sell] of [
      ["Yes", "buyYes", "sellYes"],
      ["No", "buyNo", "sellNo"],
    ] as const) {
      it(`buying ${name} then selling it back never makes money`, async () => {
        for (const amount of [E("0.001"), E(1), E(10), E(100), E(900)]) {
          const g = await deploy();
          const token = name === "Yes" ? g.long : g.short;
          const before = await g.collateral.balanceOf(g.alice.address);

          await g.amm.connect(g.alice)[buy](amount, 0);
          const held = await token.balanceOf(g.alice.address);
          await g.amm.connect(g.alice)[sell](held, 0);

          const after = await g.collateral.balanceOf(g.alice.address);
          assert.ok(after <= before, `${name} round trip of ${ethers.formatEther(amount)} gained ${ethers.formatEther(after - before)}`);
          // ...and pays at least the two-way fee, so the pool is better off.
          assert.ok(before - after > 0n, "a round trip must cost the trader something");
        }
      });
    }

    it("repeated round trips cannot drain the pool", async () => {
      const startPool = await f.amm.getReserves();
      const before = await f.collateral.balanceOf(f.mallory.address);
      for (let i = 0; i < 20; i++) {
        await f.amm.connect(f.mallory).buyYes(E(50), 0);
        await f.amm.connect(f.mallory).sellYes(await f.long.balanceOf(f.mallory.address), 0);
      }
      assert.ok((await f.collateral.balanceOf(f.mallory.address)) < before, "the attacker must lose money");
      const [yes, no] = await f.amm.getReserves();
      assert.ok(yes * no >= startPool[0] * startPool[1], "the invariant must never fall");
      await assertPoolConsistent(f);
      await assertMarketSolvent(f);
    });

    it("cross-outcome loops (buy Yes, sell No, ...) cannot profit either", async () => {
      const before = await f.collateral.balanceOf(f.mallory.address);
      await f.amm.connect(f.mallory).buyYes(E(100), 0);
      await f.amm.connect(f.mallory).buyNo(E(100), 0);
      await f.amm.connect(f.mallory).sellYes(await f.long.balanceOf(f.mallory.address), 0);
      await f.amm.connect(f.mallory).sellNo(await f.short.balanceOf(f.mallory.address), 0);
      assert.ok((await f.collateral.balanceOf(f.mallory.address)) <= before);
    });
  });

  describe("property: no sequence of trades can profit, break the invariant, or unbalance the pool", () => {
    it("holds over 150 seeded random trades from three traders", async () => {
      let seed = 1337;
      const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const traders = [f.alice, f.bob, f.mallory];
      const startBalances = await Promise.all(traders.map((t) => f.collateral.balanceOf(t.address)));
      let [yes, no] = await f.amm.getReserves();
      let k = yes * no;

      for (let i = 0; i < 150; i++) {
        const trader = traders[Math.floor(rand() * traders.length)];
        const amm = f.amm.connect(trader);
        const action = Math.floor(rand() * 4);
        const size = ethers.parseEther((0.01 + rand() * 60).toFixed(6));

        if (action === 0) await amm.buyYes(size, 0);
        else if (action === 1) await amm.buyNo(size, 0);
        else {
          const token = action === 2 ? f.long : f.short;
          const held = await token.balanceOf(trader.address);
          if (held < E("0.01")) continue;
          const amount = held < size ? held : size;
          await (action === 2 ? amm.sellYes(amount, 0) : amm.sellNo(amount, 0));
        }

        [yes, no] = await f.amm.getReserves();
        assert.ok(yes * no >= k, `invariant fell at step ${i}`);
        k = yes * no;
        await assertPoolConsistent(f);
        await assertMarketSolvent(f);
      }

      // Everyone unwinds; nobody may end up richer than they started (the pool keeps the fees).
      for (const trader of traders) {
        const yesHeld = await f.long.balanceOf(trader.address);
        const noHeld = await f.short.balanceOf(trader.address);
        if (yesHeld > E("0.01")) await f.amm.connect(trader).sellYes(yesHeld, 0);
        if (noHeld > E("0.01")) await f.amm.connect(trader).sellNo(noHeld, 0);
      }
      const traderTotal = (
        await Promise.all(
          traders.map(async (t, i) => (await f.collateral.balanceOf(t.address)) - startBalances[i])
        )
      ).reduce((a, b) => a + b, 0n);
      assert.ok(traderTotal <= 0n, `traders extracted ${ethers.formatEther(traderTotal)} ARCT from the pool`);
    });
  });

  describe("slippage protection", () => {
    it("reverts when the pool moves against the trader after they took a quote", async () => {
      const quote = await f.amm.calcBuyYes(E(50));
      // A sandwiching attacker trades first and moves the price.
      await f.amm.connect(f.mallory).buyYes(E(400), 0);
      await reverts(f.amm.connect(f.alice).buyYes(E(50), quote), "Slippage: too little Yes");
    });

    it("succeeds when the price is still good, and enforces the floor on every function", async () => {
      const quote = await f.amm.calcBuyYes(E(5));
      await f.amm.connect(f.alice).buyYes(E(5), quote); // exactly the quote is fine

      await reverts(f.amm.connect(f.alice).buyYes(E(5), E(1000)), "Slippage: too little Yes");
      await reverts(f.amm.connect(f.alice).buyNo(E(5), E(1000)), "Slippage: too little No");
      await f.amm.connect(f.alice).buyYes(E(20), 0);
      await f.amm.connect(f.alice).buyNo(E(20), 0);
      await reverts(f.amm.connect(f.alice).sellYes(E(1), E(1000)), "Slippage: too little USDC");
      await reverts(f.amm.connect(f.alice).sellNo(E(1), E(1000)), "Slippage: too little USDC");
    });
  });

  describe("after the market resolves", () => {
    beforeEach(async () => {
      await f.amm.connect(f.alice).buyYes(E(100), 0);
      await f.amm.connect(f.bob).buyNo(E(60), 0);
    });

    it("stops trading", async () => {
      await f.market.resolve(E(1));
      await reverts(f.amm.connect(f.alice).buyYes(E(1), 0), "Market resolved");
      await reverts(f.amm.connect(f.alice).sellYes(E(1), 0), "Market resolved");
    });

    it("lets only the deployer withdraw the pool's liquidity, and only once resolved", async () => {
      await reverts(f.amm.withdrawLiquidity(), "Market not resolved");
      await f.market.resolve(E(1));
      await reverts(f.amm.connect(f.mallory).withdrawLiquidity(), "Only deployer");
    });

    it("recovers the seed and the fees (they used to be stuck forever)", async () => {
      const [reserveYes] = await f.amm.getReserves();
      await f.market.resolve(E(1)); // Yes wins: pool's Yes tokens are worth 1 each, No worth 0
      const before = await f.collateral.balanceOf(f.deployer.address);

      await f.amm.withdrawLiquidity();

      const recovered = (await f.collateral.balanceOf(f.deployer.address)) - before;
      assert.equal(recovered, reserveYes);
      assert.ok(recovered > 0n);
      assert.equal(await f.collateral.balanceOf(f.ammAddress), 0n);
      assert.equal(await f.long.balanceOf(f.ammAddress), 0n);
    });

    it("leaves the market exactly solvent once traders and the pool have all settled", async () => {
      await f.market.resolve(E("0.5"));
      for (const user of [f.alice, f.bob]) {
        await f.market
          .connect(user)
          .settle(await f.long.balanceOf(user.address), await f.short.balanceOf(user.address));
      }
      await f.amm.withdrawLiquidity();
      assert.ok((await f.collateral.balanceOf(await f.market.getAddress())) <= 2n, "collateral left in the market");
    });

    it("cannot be withdrawn twice", async () => {
      await f.market.resolve(E(1));
      await f.amm.withdrawLiquidity();
      const again = await f.amm.withdrawLiquidity.staticCall();
      assert.equal(again, 0n);
    });
  });

  describe("rounding", () => {
    it("rounds swaps in the pool's favour, to the wei", async () => {
      // Reserves 7/7, no fee, buy 5: k = 49, 49 / 12 = 4.08. The pool must keep the
      // ceiling (5), so the swap pays out 7 - 5 = 2, not 3 (which floor division gave).
      const collateral = await ethers.deployContract("TestCollateral");
      const market = await ethers.deployContract("MockPredictionMarket", [await collateral.getAddress()]);
      const amm = await ethers.deployContract("PredictionMarketAMM", [await market.getAddress(), 0]);
      await collateral.allocateTo((await ethers.getSigners())[0].address, 100);
      await collateral.approve(await amm.getAddress(), 100);
      await amm.initialize(7);

      assert.equal(await amm.calcBuyYes(5), 5n + 2n);
      assert.equal(await amm.calcBuyNo(5), 5n + 2n);
    });
  });

  describe("constructor", () => {
    it("rejects a fee of 100% or more", async () => {
      const collateral = await ethers.deployContract("TestCollateral");
      const market = await ethers.deployContract("MockPredictionMarket", [await collateral.getAddress()]);
      await reverts(ethers.deployContract("PredictionMarketAMM", [await market.getAddress(), 10000]), "Fee too high");
    });

    it("records the deployer", async () => {
      assert.equal(await f.amm.deployer(), f.deployer.address);
    });
  });
});
