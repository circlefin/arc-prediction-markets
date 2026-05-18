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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMarketState } from "@/hooks/useMarket";
import { formatUnits } from "viem";

export function MarketInfo() {
  const {
    pairName,
    question,
    priceRequested,
    receivedSettlementPrice,
    settlementPrice,
    isLoading,
  } = useMarketState();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading market data...</p>
        </CardContent>
      </Card>
    );
  }

  const status = receivedSettlementPrice
    ? "Settled"
    : priceRequested
      ? "Open"
      : "Not Initialized";

  const statusVariant = receivedSettlementPrice
    ? "default"
    : priceRequested
      ? "secondary"
      : "outline";

  let outcomeText: string | undefined;
  if (receivedSettlementPrice && settlementPrice !== undefined) {
    const price = formatUnits(settlementPrice, 18);
    if (price === "1") outcomeText = "YES";
    else if (price === "0.5") outcomeText = "Cannot be determined";
    else if (price === "0") outcomeText = "NO";
    else outcomeText = `Unknown (${price})`;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{pairName ?? "Market"}</CardTitle>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {question && (
          <div>
            <p className="text-sm text-muted-foreground">Question</p>
            <p className="text-lg font-medium">{question}</p>
          </div>
        )}

        <div>
          <p className="text-sm text-muted-foreground">Resolution</p>
          <p className="text-sm">UMA Optimistic Oracle V2</p>
        </div>

        {outcomeText && (
          <div>
            <p className="text-sm text-muted-foreground">Outcome</p>
            <p className="text-lg font-bold">{outcomeText}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
