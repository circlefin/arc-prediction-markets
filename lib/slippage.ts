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

/** Default tolerance between the quote a user saw and what the trade may deliver: 1%. */
export const DEFAULT_SLIPPAGE_BPS = BigInt(100);

const BPS = BigInt(10_000);

/**
 * The smallest amount a trade may return. The AMM takes a minimum-output argument on every
 * trade; without one the trade executes at whatever price the pool has when it is mined, so
 * anyone who can order transactions can sandwich it and keep the difference.
 */
export function minAfterSlippage(quote: bigint, bps: bigint = DEFAULT_SLIPPAGE_BPS): bigint {
  if (bps < BigInt(0) || bps > BPS) throw new Error("Slippage must be between 0 and 10000 bps");
  return (quote * (BPS - bps)) / BPS;
}
