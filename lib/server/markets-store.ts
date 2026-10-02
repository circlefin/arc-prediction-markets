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

import * as fs from "fs";
import * as path from "path";

export interface StoredMarket {
  id: string;
  address: string;
  ammAddress: string;
  title: string;
  category: string;
  createdAt: string;
}

/** The registry is a JSON file. Tests point MARKETS_FILE at a temporary one. */
export function marketsFilePath(): string {
  return process.env.MARKETS_FILE ?? path.resolve(process.cwd(), "data", "markets.json");
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isStoredMarket(value: unknown): value is StoredMarket {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.address === "string" && ADDRESS.test(m.address) &&
    typeof m.ammAddress === "string" && ADDRESS.test(m.ammAddress) &&
    typeof m.title === "string" &&
    typeof m.category === "string" &&
    typeof m.createdAt === "string"
  );
}

/** Reads the registry, dropping anything malformed instead of serving it to the UI. */
export function readMarkets(): StoredMarket[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(marketsFilePath(), "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(isStoredMarket) : [];
  } catch {
    return [];
  }
}

/**
 * Writes the whole registry atomically: to a temporary file, then renamed over the real one.
 * A crash or a concurrent reader can never see a half-written file (which readMarkets would
 * treat as "no markets", hiding every market until the next write).
 */
export function writeMarkets(markets: StoredMarket[]): void {
  const file = marketsFilePath();
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(markets, null, 2) + "\n");
  fs.renameSync(temp, file);
}

export const DEFAULT_MAX_MARKETS = 100;

export function maxMarkets(): number {
  const configured = Number(process.env.MAX_MARKETS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_MARKETS;
}
