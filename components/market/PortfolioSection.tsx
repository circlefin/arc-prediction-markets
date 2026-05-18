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

"use client";

import { formatUnits } from "viem";
import { formatCollateral } from "@/hooks/market/helpers";
import { COLLATERAL_DECIMALS } from "@/lib/contracts";

interface PortfolioSectionProps {
  arctBalance: bigint | undefined;
  longBalance: bigint | undefined;
  shortBalance: bigint | undefined;
  yesPrice: number | undefined;
  noPrice: number | undefined;
}

export function PortfolioSection({
  arctBalance,
  longBalance,
  shortBalance,
  yesPrice,
  noPrice,
}: PortfolioSectionProps) {
  const yesTokenValue = longBalance !== undefined && yesPrice !== undefined
    ? parseFloat(formatUnits(longBalance, COLLATERAL_DECIMALS)) * (yesPrice / 100)
    : undefined;
  const noTokenValue = shortBalance !== undefined && noPrice !== undefined
    ? parseFloat(formatUnits(shortBalance, COLLATERAL_DECIMALS)) * (noPrice / 100)
    : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Your Portfolio
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">ARCT Balance</p>
          <p className="font-mono text-sm">{formatCollateral(arctBalance)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Yes Tokens</p>
          <p className="font-mono text-sm text-green-500">
            {formatCollateral(longBalance)}
          </p>
          {yesTokenValue !== undefined && yesTokenValue > 0 && (
            <p className="text-xs text-muted-foreground font-mono">
              ~{yesTokenValue.toFixed(2)} ARCT
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">No Tokens</p>
          <p className="font-mono text-sm text-red-400">
            {formatCollateral(shortBalance)}
          </p>
          {noTokenValue !== undefined && noTokenValue > 0 && (
            <p className="text-xs text-muted-foreground font-mono">
              ~{noTokenValue.toFixed(2)} ARCT
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
