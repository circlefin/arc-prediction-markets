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

import { Badge } from "@/components/ui/badge";
import { formatUnits } from "viem";

interface MarketHeaderProps {
  pairName: string | undefined;
  question: string | undefined;
  priceRequested: boolean | undefined;
  receivedSettlementPrice: boolean | undefined;
  settlementPrice: bigint | undefined;
}

export function MarketHeader({
  pairName,
  question,
  priceRequested,
  receivedSettlementPrice,
  settlementPrice,
}: MarketHeaderProps) {
  const status = receivedSettlementPrice
    ? "Settled"
    : priceRequested
      ? "Open"
      : "Not Initialized";

  const statusColor = receivedSettlementPrice
    ? "bg-green-500/15 text-green-500 border-green-500/30"
    : priceRequested
      ? "bg-green-500/15 text-green-500 border-green-500/30"
      : "bg-secondary text-secondary-foreground";

  let outcomeText: string | undefined;
  if (receivedSettlementPrice && settlementPrice !== undefined) {
    const price = formatUnits(settlementPrice, 18);
    if (price === "1") outcomeText = "YES";
    else if (price === "0.5") outcomeText = "Cannot be determined";
    else if (price === "0") outcomeText = "NO";
    else outcomeText = `Unknown (${price})`;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-2xl">
            {pairName?.startsWith("BTC") ? "\u20BF" : "\u{1F52E}"}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {question ?? pairName ?? "Market"}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{pairName}</span>
              <span className="text-muted-foreground/40">|</span>
              <span>UMA Optimistic Oracle V2</span>
            </div>
          </div>
        </div>
        <Badge className={statusColor}>{status}</Badge>
      </div>

      {outcomeText && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
          <p className="text-sm text-muted-foreground">Outcome</p>
          <p className="text-xl font-bold text-green-500">{outcomeText}</p>
        </div>
      )}
    </div>
  );
}
