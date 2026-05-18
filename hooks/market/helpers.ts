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

import { formatUnits } from "viem";
import { COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";
import { OracleState } from "@/lib/contracts/types";

export function formatCollateral(amount: bigint | undefined, full?: boolean): string {
  if (amount === undefined) return "0.00";
  const raw = formatUnits(amount, COLLATERAL_DECIMALS);
  if (full) return raw;
  const n = parseFloat(raw);
  if (n === 0) return "0.00";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function oracleStateLabel(state: OracleState | undefined, opts?: { priceRequested?: boolean }): string {
  switch (state) {
    case OracleState.Invalid:
      return opts?.priceRequested ? "Awaiting Arbitration" : "Invalid";
    case OracleState.Requested: return "No Proposal Yet";
    case OracleState.Proposed: return "Proposed";
    case OracleState.Expired: return "Ready to Settle";
    case OracleState.Disputed: return "Disputed";
    case OracleState.Resolved: return "Resolved";
    case OracleState.Settled: return "Settled";
    default: return "Unknown";
  }
}
