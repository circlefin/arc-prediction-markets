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

import { describe, expect, it } from "vitest";
import { isAuthorizedToCreate } from "@/lib/server/bearer";
import { DEFAULT_SLIPPAGE_BPS, minAfterSlippage } from "@/lib/slippage";
import nextConfig, { securityHeaders } from "@/next.config";

const n = (value: number | string) => BigInt(value);

describe("isAuthorizedToCreate", () => {
  it("is open when no token is configured (demo mode)", () => {
    expect(isAuthorizedToCreate(null, undefined)).toBe(true);
    expect(isAuthorizedToCreate("Bearer anything", "")).toBe(true);
  });

  it("requires the exact token when one is configured", () => {
    expect(isAuthorizedToCreate("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedToCreate("Bearer s3cret ", "s3cret")).toBe(false);
    expect(isAuthorizedToCreate("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedToCreate("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedToCreate("Basic s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedToCreate("Bearer ", "s3cret")).toBe(false);
    expect(isAuthorizedToCreate(null, "s3cret")).toBe(false);
  });
});

describe("minAfterSlippage", () => {
  it("takes the tolerance off the quote", () => {
    expect(minAfterSlippage(n(10_000), n(100))).toBe(n(9_900));
    expect(DEFAULT_SLIPPAGE_BPS).toBe(n(100));
    expect(minAfterSlippage(n(10_000))).toBe(n(9_900));
  });

  it("rounds down, so the floor never exceeds the quote", () => {
    expect(minAfterSlippage(n(101), n(100))).toBe(n(99));
    expect(minAfterSlippage(n(1), n(100))).toBe(n(0));
  });

  it("handles zero tolerance, full tolerance and 18-decimal amounts", () => {
    expect(minAfterSlippage(n(500), n(0))).toBe(n(500));
    expect(minAfterSlippage(n(500), n(10_000))).toBe(n(0));
    expect(minAfterSlippage(n("1000000000000000000"))).toBe(n("990000000000000000"));
  });

  it("rejects an out-of-range tolerance rather than silently disabling protection", () => {
    expect(() => minAfterSlippage(n(1), n(-1))).toThrow();
    expect(() => minAfterSlippage(n(1), n(10_001))).toThrow();
  });
});

describe("next.config", () => {
  it("sends the baseline security headers on every route", async () => {
    expect(await nextConfig.headers!()).toEqual([{ source: "/:path*", headers: securityHeaders }]);
    const headers = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});
