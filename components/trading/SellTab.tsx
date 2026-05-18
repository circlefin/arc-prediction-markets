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
import { formatCollateral } from "@/hooks/market/helpers";
import { COLLATERAL_DECIMALS } from "@/lib/contracts";
import { TxStatus, type TxStatusProps } from "./TxStatus";
import { OutcomeSelector } from "./OutcomeSelector";

type Outcome = "yes" | "no";

interface SellTabProps {
  outcome: Outcome;
  onOutcomeChange: (o: Outcome) => void;
  amount: string;
  onAmountChange: (a: string) => void;
  yesPrice?: number;
  noPrice?: number;
  longBalance: bigint | undefined;
  shortBalance: bigint | undefined;
  sellPreview: bigint | undefined;
  needsApproval: boolean;
  isAllowancesLoading: boolean;
  approveHook: TxStatusProps & { approve: (amount: bigint) => void };
  sellHook: TxStatusProps & { sell: (amount: string) => void };
}

export function SellTab({
  outcome,
  onOutcomeChange,
  amount,
  onAmountChange,
  yesPrice,
  noPrice,
  longBalance,
  shortBalance,
  sellPreview,
  needsApproval,
  isAllowancesLoading,
  approveHook,
  sellHook,
}: SellTabProps) {
  const selectedBalance = outcome === "yes" ? longBalance : shortBalance;
  const hasTokens = selectedBalance && selectedBalance > 0n;
  const amountBigInt = amount ? parseUnits(amount, COLLATERAL_DECIMALS) : 0n;
  const spotPrice = outcome === "yes" ? yesPrice : noPrice;

  let avgPrice: number | undefined;
  let priceImpact: number | undefined;

  if (sellPreview !== undefined && amountBigInt > 0n) {
    const received = parseFloat(formatUnits(sellPreview, COLLATERAL_DECIMALS));
    const tokensSpent = parseFloat(amount);
    if (tokensSpent > 0) {
      avgPrice = received / tokensSpent;
      const otherPrice = outcome === "yes" ? noPrice : yesPrice;
      if (spotPrice !== undefined && spotPrice > 0 && otherPrice !== undefined && otherPrice > 0) {
        const marginalRate = spotPrice / otherPrice;
        priceImpact = Math.abs((avgPrice - marginalRate) / marginalRate) * 100;
      }
    }
  }

  return (
    <div className="space-y-4">
      <OutcomeSelector
        outcome={outcome}
        onSelect={onOutcomeChange}
        label="Token to sell"
      />

      {!hasTokens ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          You don&apos;t have any {outcome === "yes" ? "Yes" : "No"} tokens to sell.
          {(!longBalance || longBalance === 0n) && (!shortBalance || shortBalance === 0n)
            ? " Buy tokens first on the Buy tab."
            : ` Try selling your ${outcome === "yes" ? "No" : "Yes"} tokens instead.`}
        </p>
      ) : (
        <>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Your balance</p>
            <p className="font-mono text-lg">
              {formatCollateral(selectedBalance)}{" "}
              {outcome === "yes" ? "Yes" : "No"} tokens
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Amount (tokens)
            </p>
            <Input
              type="number"
              placeholder="0"
              min="0"
              max={formatCollateral(selectedBalance, true)}
              value={amount}
              onChange={(e) => {
                const raw = e.target.value;
                if (!raw || parseFloat(raw) <= 0) {
                  onAmountChange(raw);
                  return;
                }
                const parsed = parseUnits(raw, COLLATERAL_DECIMALS);
                const safeMax = selectedBalance > 1n ? selectedBalance - 1n : selectedBalance;
                if (parsed > safeMax) {
                  onAmountChange(formatUnits(safeMax, COLLATERAL_DECIMALS));
                } else {
                  onAmountChange(raw);
                }
              }}
              className="text-right text-lg font-mono h-12"
            />
            <button
              className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                const safeMax = selectedBalance > 1n ? selectedBalance - 1n : selectedBalance;
                onAmountChange(formatUnits(safeMax, COLLATERAL_DECIMALS));
              }}
            >
              Max
            </button>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">You receive</span>
              <span className="font-mono">
                {sellPreview !== undefined
                  ? `${parseFloat(formatUnits(sellPreview, COLLATERAL_DECIMALS)).toFixed(2)}`
                  : "0.00"} ARCT
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
                onClick={() => approveHook.approve(parseUnits("1000000", COLLATERAL_DECIMALS))}
                disabled={approveHook.isPending || approveHook.isConfirming}
              >
                {approveHook.isPending || approveHook.isConfirming
                  ? "Approving..."
                  : `Approve ${outcome === "yes" ? "Yes" : "No"} Token`}
              </Button>
              <TxStatus {...approveHook} />
            </>
          ) : (
            <>
              <Button
                className="w-full"
                onClick={() => sellHook.sell(amount)}
                disabled={
                  sellHook.isPending || sellHook.isConfirming ||
                  !amount ||
                  parseFloat(amount) <= 0
                }
              >
                {sellHook.isPending || sellHook.isConfirming
                  ? "Selling..."
                  : `Sell ${outcome === "yes" ? "Yes" : "No"}`}
              </Button>
              <TxStatus {...sellHook} />
            </>
          )}
        </>
      )}
    </div>
  );
}
