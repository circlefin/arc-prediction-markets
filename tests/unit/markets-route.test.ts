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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/markets/route";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "markets-route-"));
  vi.stubEnv("MARKETS_FILE", join(dir, "markets.json"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/markets", () => {
  it("returns an empty list when nothing has been created", async () => {
    expect(await (await GET()).json()).toEqual([]);
  });

  it("serves only well-formed markets, so a corrupted or tampered file cannot inject content", async () => {
    const good = {
      id: "user-1",
      address: "0x" + "11".repeat(20),
      ammAddress: "0x" + "22".repeat(20),
      title: "Will it rain?",
      category: "Crypto",
      createdAt: "2026-09-19T00:00:00.000Z",
    };
    writeFileSync(
      join(dir, "markets.json"),
      JSON.stringify([good, { ...good, id: "evil", address: "javascript:alert(1)" }, { id: "partial" }])
    );
    expect(await (await GET()).json()).toEqual([good]);
  });
});
