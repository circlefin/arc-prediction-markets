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

import { parseUnits, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { COLLATERAL_DECIMALS } from "@/lib/contracts";
import { TxStatus, type TxStatusProps } from "./TxStatus";
import { OutcomeSelector } from "./OutcomeSelector";

type Outcome = "yes" | "no";

interface BuyTabProps {
  outcome: Outcome;
  onOutcomeChange: (o: Outcome) => void;
  amount: string;
  onAmountChange: (a: string) => void;
  yesPrice?: number;
  noPrice?: number;
  buyPreview: bigint | undefined;
  needsApproval: boolean;
  isAllowancesLoading: boolean;
  approveArct: TxStatusProps & { approve: (amount: bigint) => void };
  buyHook: TxStatusProps & { buy: (amount: string) => void };
}

export function BuyTab({
  outcome,
  onOutcomeChange,
  amount,
  onAmountChange,
  yesPrice,
  noPrice,
  buyPreview,
  needsApproval,
  isAllowancesLoading,
  approveArct,
  buyHook,
}: BuyTabProps) {
  const amountBigInt = amount ? parseUnits(amount, COLLATERAL_DECIMALS) : 0n;
  const spotPrice = outcome === "yes" ? yesPrice : noPrice;

  let avgPrice: number | undefined;
  let priceImpact: number | undefined;

  if (buyPreview !== undefined && amountBigInt > 0n) {
    const tokensReceived = parseFloat(formatUnits(buyPreview, COLLATERAL_DECIMALS));
    const spent = parseFloat(amount);
    if (tokensReceived > 0) {
      avgPrice = spent / tokensReceived;
      if (spotPrice !== undefined && spotPrice > 0) {
        priceImpact = Math.abs((avgPrice - spotPrice / 100) / (spotPrice / 100)) * 100;
      }
    }
  }

  return (
    <div className="space-y-4">
      <OutcomeSelector
        outcome={outcome}
        onSelect={onOutcomeChange}
        yesPrice={yesPrice}
        noPrice={noPrice}
      />

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Amount (ARCT)
        </p>
        <Input
          type="number"
          placeholder="0"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="text-right text-lg font-mono h-12"
        />
        <div className="flex gap-1 mt-2">
          {["10", "50", "100", "500"].map((v) => (
            <button
              key={v}
              onClick={() => onAmountChange(v)}
              className="flex-1 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">You receive</span>
          <span className="font-mono">
            {buyPreview !== undefined
              ? `${parseFloat(formatUnits(buyPreview, COLLATERAL_DECIMALS)).toFixed(2)} ${outcome === "yes" ? "Yes" : "No"}`
              : `0 ${outcome === "yes" ? "Yes" : "No"}`} tokens
          </span>
        </div>
        {avgPrice !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg price</span>
            <span className="font-mono">{avgPrice.toFixed(4)} ARCT</span>
          </div>
        )}
        {priceImpact !== undefined && priceImpact > 0.1 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price impact</span>
            <span className={`font-mono ${priceImpact > 5 ? "text-red-400" : "text-yellow-500"}`}>
              {priceImpact.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {isAllowancesLoading ? (
        <Skeleton className="h-10 w-full rounded-md" />
      ) : needsApproval ? (
        <>
          <Button
            className="w-full"
            variant="outline"
            onClick={() =>
              approveArct.approve(parseUnits("1000000", COLLATERAL_DECIMALS))
            }
            disabled={approveArct.isPending || approveArct.isConfirming}
          >
            {approveArct.isPending || approveArct.isConfirming
              ? "Approving..."
              : "Approve ARCT"}
          </Button>
          <TxStatus {...approveArct} />
        </>
      ) : (
        <>
          <Button
            className={`w-full text-white ${outcome === "yes"
              ? "bg-green-600 hover:bg-green-700"
              : "bg-red-500 hover:bg-red-600"
              }`}
            onClick={() => buyHook.buy(amount)}
            disabled={
              buyHook.isPending || buyHook.isConfirming ||
              !amount ||
              parseFloat(amount) <= 0
            }
          >
            {buyHook.isPending || buyHook.isConfirming
              ? "Buying..."
              : `Buy ${outcome === "yes" ? "Yes" : "No"}`}
          </Button>
          <TxStatus {...buyHook} />
        </>
      )}
    </div>
  );
}
