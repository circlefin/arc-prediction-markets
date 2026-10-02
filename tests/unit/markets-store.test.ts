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

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renames = vi.hoisted(() => [] as [string, string][]);
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      renames.push([from, to]);
      return actual.renameSync(from, to);
    },
  };
});

import {
  DEFAULT_MAX_MARKETS,
  isStoredMarket,
  maxMarkets,
  readMarkets,
  writeMarkets,
  type StoredMarket,
} from "@/lib/server/markets-store";

const market = (over: Partial<StoredMarket> = {}): StoredMarket => ({
  id: "user-1",
  address: "0x" + "11".repeat(20),
  ammAddress: "0x" + "22".repeat(20),
  title: "Will it rain?",
  category: "Crypto",
  createdAt: "2026-09-19T00:00:00.000Z",
  ...over,
});

let dir: string;
let file: string;

beforeEach(() => {
  renames.length = 0;
  dir = mkdtempSync(join(tmpdir(), "markets-"));
  file = join(dir, "markets.json");
  vi.stubEnv("MARKETS_FILE", file);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("markets store", () => {
  it("round-trips markets in the order written", () => {
    writeMarkets([market({ id: "b" }), market({ id: "a" })]);
    expect(readMarkets().map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("returns an empty list when the file is missing or corrupt", () => {
    expect(readMarkets()).toEqual([]);
    writeFileSync(file, "{ not json");
    expect(readMarkets()).toEqual([]);
    writeFileSync(file, JSON.stringify({ not: "an array" }));
    expect(readMarkets()).toEqual([]);
  });

  it("drops malformed entries instead of serving them to the UI", () => {
    writeFileSync(
      file,
      JSON.stringify([
        market({ id: "good" }),
        { id: "no-address" },
        market({ id: "bad-address", address: "0x123" }),
        market({ id: "script", ammAddress: "javascript:alert(1)" }),
        null,
        "string",
      ])
    );
    expect(readMarkets().map((m) => m.id)).toEqual(["good"]);
  });

  it("writes atomically: no temporary file is left behind, and the file is always complete JSON", () => {
    for (let i = 0; i < 20; i++) writeMarkets([market({ id: "m" + i })]);
    expect(readdirSync(dir)).toEqual(["markets.json"]);
    expect(() => JSON.parse(readFileSync(file, "utf-8"))).not.toThrow();
  });

  it("publishes the file with a rename, so a reader never sees a half-written one", () => {
    writeMarkets([market()]);
    expect(renames).toHaveLength(1);
    const [from, to] = renames[0];
    expect(to).toBe(file);
    expect(from).not.toBe(file);
    expect(from.startsWith(file)).toBe(true);
  });

  it("validates the shape of a market", () => {
    expect(isStoredMarket(market())).toBe(true);
    expect(isStoredMarket({ ...market(), title: 5 })).toBe(false);
    expect(isStoredMarket(undefined)).toBe(false);
  });
});

describe("maxMarkets", () => {
  it("defaults, and honours a valid MAX_MARKETS", () => {
    expect(maxMarkets()).toBe(DEFAULT_MAX_MARKETS);
    vi.stubEnv("MAX_MARKETS", "5");
    expect(maxMarkets()).toBe(5);
  });

  it.each(["0", "-3", "abc", "1.5", ""])("ignores the invalid value %j", (value) => {
    vi.stubEnv("MAX_MARKETS", value);
    expect(maxMarkets()).toBe(DEFAULT_MAX_MARKETS);
  });
});
