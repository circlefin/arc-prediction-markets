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

import Link from "next/link";
import type { MarketCardData } from "@/lib/markets";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketCardData } from "@/hooks/useMarket";
import { type Address } from "viem";

export function MarketCard({ market }: { market: MarketCardData }) {
  const { status, volume, settlementOutcome, ammYesPrice, isLoading } = useMarketCardData(
    market.address as Address,
    market.ammAddress as Address | undefined,
    !!market.isReal
  );

  const isSettled = market.isReal && status === "Settled";
  const hasAmmPrice = market.isReal && ammYesPrice !== undefined;
  const displayVolume = market.isReal
    ? hasAmmPrice ? (volume ?? "-") : "-"
    : market.volume;

  // Use AMM price for real markets, static price for demos, null if AMM not ready
  const yesPercent = hasAmmPrice
    ? Math.round(ammYesPrice * 100)
    : !market.isReal
      ? Math.round(market.yesPrice * 100)
      : null;

  const href = market.isReal ? `/market/${market.address}` : "#";

  if (market.isReal && isLoading) {
    return (
      <div className="block rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-7 w-12 shrink-0" />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Skeleton className="flex-1 h-8 rounded-md" />
          <Skeleton className="flex-1 h-8 rounded-md" />
        </div>
        <div className="flex items-center justify-between mt-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 ${!market.isReal ? "opacity-60 cursor-default" : ""
        }`}
      onClick={!market.isReal ? (e) => e.preventDefault() : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
            {market.icon}
          </div>
          <h3 className="text-sm font-medium leading-tight line-clamp-2">
            {market.title}
          </h3>
        </div>
        <div className="shrink-0 flex flex-col items-center">
          {isSettled && settlementOutcome ? (
            <span className={`text-lg font-bold ${settlementOutcome === "YES" ? "text-green-500" :
                settlementOutcome === "NO" ? "text-red-400" : "text-yellow-500"
              }`}>
              {settlementOutcome}
            </span>
          ) : yesPercent !== null ? (
            <>
              <span className="text-lg font-bold text-green-500">
                {yesPercent}%
              </span>
              <span className="text-[10px] text-muted-foreground">chance</span>
            </>
          ) : (
            <Badge variant="outline" className="text-xs">
              {status}
            </Badge>
          )}
        </div>
      </div>

      {!isSettled && (
        <div className="flex items-center gap-2 mt-3">
          <button className="flex-1 rounded-md bg-green-600/15 py-1.5 text-xs font-medium text-green-500 transition-colors group-hover:bg-green-600/25">
            Buy Yes
          </button>
          <button className="flex-1 rounded-md bg-red-500/15 py-1.5 text-xs font-medium text-red-400 transition-colors group-hover:bg-red-500/25">
            Buy No
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <span>{displayVolume} Vol.</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {market.category}
        </Badge>
      </div>

      {!market.isReal && (
        <div className="mt-2 text-[10px] text-muted-foreground text-center">
          Demo only
        </div>
      )}
    </Link>
  );
}
