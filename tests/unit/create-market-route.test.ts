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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({
  publicClient: { readContract: vi.fn(), waitForTransactionReceipt: vi.fn() },
  walletClient: { writeContract: vi.fn(), deployContract: vi.fn() },
}));
const store = vi.hoisted(() => ({ readMarkets: vi.fn(), writeMarkets: vi.fn() }));

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => chain.publicClient,
  createWalletClient: () => chain.walletClient,
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: (path: string, ...rest: unknown[]) =>
      String(path).includes("artifacts")
        ? JSON.stringify({ abi: [], bytecode: "0x6000" })
        : (actual.readFileSync as (...a: unknown[]) => unknown)(path, ...rest),
  };
});
vi.mock("@/lib/server/markets-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/markets-store")>()),
  readMarkets: store.readMarkets,
  writeMarkets: store.writeMarkets,
}));

// The route holds its rate-limit state in module scope, so each test loads a fresh copy.
let POST: (request: Request) => Promise<Response>;

const MARKET = "0x" + "aa".repeat(20);
const AMM = "0x" + "bb".repeat(20);

const post = (body: unknown, headers: Record<string, string> = {}, raw = false) =>
  POST(
    new Request("http://localhost/api/create-market", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw ? (body as string) : JSON.stringify(body),
    })
  );

const validBody = { title: "Will ETH flip BTC by 2027?" };

/** Each request comes from a different client, so only the global controls apply. */
let client = 0;
const fromNewClient = () => ({ "x-forwarded-for": `10.0.0.${++client}` });

beforeEach(async () => {
  vi.resetModules();
  ({ POST } = await import("@/app/api/create-market/route"));
  vi.stubEnv("PRIVATE_KEY", "0x" + "11".repeat(32));
  vi.stubEnv("NEXT_PUBLIC_ARCT_ADDRESS", "0x" + "01".repeat(20));
  vi.stubEnv("NEXT_PUBLIC_FINDER_ADDRESS", "0x" + "02".repeat(20));
  vi.stubEnv("NEXT_PUBLIC_TIMER_ADDRESS", "0x" + "03".repeat(20));
  vi.stubEnv("CREATE_MARKET_TOKEN", "");
  Object.values(chain.publicClient).forEach((fn) => fn.mockReset());
  Object.values(chain.walletClient).forEach((fn) => fn.mockReset());
  store.readMarkets.mockReset().mockReturnValue([]);
  store.writeMarkets.mockReset();

  chain.publicClient.readContract.mockResolvedValue(BigInt("100000000000000000000000")); // plenty of ARCT
  chain.walletClient.writeContract.mockResolvedValue("0xwrite");
  chain.walletClient.deployContract
    .mockResolvedValueOnce("0xdeploy-market")
    .mockResolvedValueOnce("0xdeploy-amm");
  chain.publicClient.waitForTransactionReceipt
    .mockResolvedValueOnce({ contractAddress: MARKET }) // market deploy
    .mockResolvedValueOnce({}) // approve
    .mockResolvedValueOnce({}) // initialize market
    .mockResolvedValueOnce({ contractAddress: AMM }) // amm deploy
    .mockResolvedValue({}); // approve + seed
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/create-market — before anything is spent", () => {
  it("requires the bearer token when one is configured", async () => {
    vi.stubEnv("CREATE_MARKET_TOKEN", "s3cret");
    const res = await post(validBody, fromNewClient());
    expect(res.status).toBe(401);
    expect(chain.walletClient.deployContract).not.toHaveBeenCalled();
  });

  it("accepts the right token", async () => {
    vi.stubEnv("CREATE_MARKET_TOKEN", "s3cret");
    const res = await post(validBody, { ...fromNewClient(), authorization: "Bearer s3cret" });
    expect(res.status).toBe(200);
  });

  it.each([
    ["a missing title", {}],
    ["a too-short title", { title: "hi" }],
    ["an oversized title (the caller would choose the gas bill)", { title: "x".repeat(5000) }],
    ["a non-string title", { title: 12345 }],
  ])("rejects %s without touching the chain", async (_name, body) => {
    const res = await post(body, fromNewClient());
    expect(res.status).toBe(400);
    expect(chain.walletClient.deployContract).not.toHaveBeenCalled();
    expect(chain.walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    expect((await post("not json", fromNewClient(), true)).status).toBe(400);
    expect(chain.walletClient.deployContract).not.toHaveBeenCalled();
  });

  it("refuses to create more markets than the configured maximum", async () => {
    vi.stubEnv("MAX_MARKETS", "2");
    store.readMarkets.mockReturnValue([{}, {}]);
    const res = await post(validBody, fromNewClient());
    expect(res.status).toBe(409);
    expect(chain.walletClient.deployContract).not.toHaveBeenCalled();
  });
});

describe("POST /api/create-market — creating", () => {
  it("deploys, then records the market with a normalised title", async () => {
    const res = await post({ title: "  Will   ETH flip BTC   by 2027?  " }, fromNewClient());

    expect(res.status).toBe(200);
    const { market } = await res.json();
    expect(market).toMatchObject({ address: MARKET, ammAddress: AMM, title: "Will ETH flip BTC by 2027?" });
    expect(store.writeMarkets).toHaveBeenCalledWith([expect.objectContaining({ address: MARKET, ammAddress: AMM })]);
  });

  it("puts the new market first and keeps the existing ones", async () => {
    const existing = { id: "old", address: MARKET, ammAddress: AMM, title: "Old", category: "Crypto", createdAt: "x" };
    store.readMarkets.mockReturnValue([existing]);

    const res = await post(validBody, fromNewClient());

    expect(res.status).toBe(200);
    const written = store.writeMarkets.mock.calls[0][0];
    expect(written).toHaveLength(2);
    expect(written[0].title).toBe("Will ETH flip BTC by 2027?");
    expect(written[1]).toEqual(existing);
  });

  it("does not leak the text of a chain error (it can carry RPC URLs and account details)", async () => {
    chain.walletClient.deployContract.mockReset().mockRejectedValue(
      new Error("HTTP request failed. URL: https://rpc.internal.example/?key=SECRET_KEY_123 from 0xdeadbeef")
    );
    const res = await post(validBody, fromNewClient());
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("SECRET_KEY_123");
    expect(text).not.toContain("rpc.internal");
  });

  it("tells the caller where the contracts are if it deployed but could not save the list", async () => {
    store.writeMarkets.mockImplementation(() => {
      throw new Error("EROFS: read-only file system");
    });
    const res = await post(validBody, fromNewClient());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.market).toEqual({ address: MARKET, ammAddress: AMM });
    expect(JSON.stringify(body)).not.toContain("EROFS");
  });

  it("does not deploy when the server has no key configured", async () => {
    vi.stubEnv("PRIVATE_KEY", "");
    const res = await post(validBody, fromNewClient());
    expect(res.status).toBe(500);
    expect(chain.walletClient.deployContract).not.toHaveBeenCalled();
  });
});

describe("POST /api/create-market — limits", () => {
  it("only lets one creation run at a time", async () => {
    let finish: (value: unknown) => void = () => undefined;
    chain.publicClient.waitForTransactionReceipt.mockReset().mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );

    const first = post(validBody, fromNewClient());
    await vi.waitFor(() => expect(chain.walletClient.deployContract).toHaveBeenCalled());

    const second = await post({ title: "A second market at the same time" }, fromNewClient());
    expect(second.status).toBe(503);
    expect(second.headers.get("Retry-After")).toBeTruthy();

    chain.publicClient.waitForTransactionReceipt.mockReset().mockRejectedValue(new Error("stop"));
    finish({});
    await first;
  });

  it("enforces a cooldown after a successful creation, with Retry-After", async () => {
    expect((await post(validBody, fromNewClient())).status).toBe(200);

    const blocked = await post({ title: "Another market right after" }, fromNewClient());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(chain.walletClient.deployContract).toHaveBeenCalledTimes(2); // only the first market's two contracts
  });

  it("does not start a cooldown when a creation fails", async () => {
    chain.walletClient.deployContract.mockReset().mockRejectedValue(new Error("boom"));
    expect((await post(validBody, fromNewClient())).status).toBe(500);

    chain.walletClient.deployContract.mockReset().mockResolvedValueOnce("0xm").mockResolvedValueOnce("0xa");
    chain.publicClient.waitForTransactionReceipt.mockReset()
      .mockResolvedValueOnce({ contractAddress: MARKET })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ contractAddress: AMM })
      .mockResolvedValue({});
    expect((await post({ title: "Retry after a failure" }, fromNewClient())).status).toBe(200);
  });

  it("limits one client to a few creations per hour", async () => {
    vi.stubEnv("CREATE_MARKET_COOLDOWN_SECONDS", "0");
    vi.resetModules();
    ({ POST } = await import("@/app/api/create-market/route"));
    const sameClient = { "x-forwarded-for": "203.0.113.9" };

    for (let i = 0; i < 3; i++) {
      chain.walletClient.deployContract.mockReset().mockResolvedValueOnce("0xm").mockResolvedValueOnce("0xa");
      chain.publicClient.waitForTransactionReceipt.mockReset()
        .mockResolvedValueOnce({ contractAddress: MARKET })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ contractAddress: AMM })
        .mockResolvedValue({});
      expect((await post({ title: "Market number " + i + " today" }, sameClient)).status).toBe(200);
    }

    const fourth = await post({ title: "A fourth market today" }, sameClient);
    expect(fourth.status).toBe(429);
  });
});
