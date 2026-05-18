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

import { useState, useEffect } from "react";
import { parseUnits, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useMarketState, useTokenBalances, useSettlePosition, formatCollateral } from "@/hooks/useMarket";
import { COLLATERAL_DECIMALS } from "@/lib/contracts";
import { ActionTxStatus } from "./ActionTxStatus";

export function SettleSection() {
  const [longAmount, setLongAmount] = useState("");
  const [shortAmount, setShortAmount] = useState("");
  const { receivedSettlementPrice, settlementPrice, longTokenAddress, shortTokenAddress } = useMarketState();
  const { longBalance, shortBalance } = useTokenBalances(longTokenAddress, shortTokenAddress);
  const { settle, isPending, isConfirming, isSuccess, error, hash } = useSettlePosition();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);

  const hasNoTokens = !longBalance && !shortBalance;
  const price = settlementPrice !== undefined ? Number(settlementPrice) / 1e18 : undefined;
  const longPaysOut = price !== undefined && price > 0;
  const shortPaysOut = price !== undefined && price < 1;
  const redeemableLong = longPaysOut ? longBalance ?? 0n : 0n;
  const redeemableShort = shortPaysOut ? shortBalance ?? 0n : 0n;
  const hasRedeemableTokens = redeemableLong > 0n || redeemableShort > 0n;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        After the market is resolved via the Optimistic Oracle, settle your tokens for ARCT based on the outcome.
        {receivedSettlementPrice && price !== undefined && (
          <> Settlement price: <strong>{price}</strong> (
            {price === 1 ? "Yes" : price === 0 ? "No" : `${price}`}
          )</>
        )}
      </p>
      {!receivedSettlementPrice ? (
        <p className="text-sm text-yellow-500">Market has not been resolved yet. Use the Resolve tab in the trading panel.</p>
      ) : hasNoTokens ? (
        <p className="text-sm text-muted-foreground">Market resolved. You have no tokens to settle.</p>
      ) : !hasRedeemableTokens ? (
        <p className="text-sm text-muted-foreground">
          Market resolved to {price === 1 ? "Yes" : price === 0 ? "No" : price}.
          {" "}Your {longBalance ? "Long (Yes)" : "Short (No)"} tokens have no payout.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {redeemableLong > 0n && <>Long: {formatCollateral(redeemableLong)}</>}
            {redeemableLong > 0n && redeemableShort > 0n && " | "}
            {redeemableShort > 0n && <>Short: {formatCollateral(redeemableShort)}</>}
          </p>
          <div className="flex gap-2">
            {redeemableLong > 0n && (
              <Input
                type="number"
                placeholder="Long tokens"
                min="0"
                max={formatCollateral(redeemableLong, true)}
                value={longAmount}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw || parseFloat(raw) <= 0) { setLongAmount(raw); return; }
                  const parsed = parseUnits(raw, COLLATERAL_DECIMALS);
                  setLongAmount(parsed > redeemableLong ? formatUnits(redeemableLong, COLLATERAL_DECIMALS) : raw);
                }}
              />
            )}
            {redeemableShort > 0n && (
              <Input
                type="number"
                placeholder="Short tokens"
                min="0"
                max={formatCollateral(redeemableShort, true)}
                value={shortAmount}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw || parseFloat(raw) <= 0) { setShortAmount(raw); return; }
                  const parsed = parseUnits(raw, COLLATERAL_DECIMALS);
                  setShortAmount(parsed > redeemableShort ? formatUnits(redeemableShort, COLLATERAL_DECIMALS) : raw);
                }}
              />
            )}
            <Button
              onClick={() => {
                const longVal = longAmount ? parseUnits(longAmount, COLLATERAL_DECIMALS) : 0n;
                const shortVal = shortAmount ? parseUnits(shortAmount, COLLATERAL_DECIMALS) : 0n;
                settle(
                  longVal > redeemableLong ? redeemableLong : longVal,
                  shortVal > redeemableShort ? redeemableShort : shortVal,
                );
              }}
              disabled={isPending || isConfirming || (!Number(longAmount) && !Number(shortAmount))}
            >
              Settle
            </Button>
          </div>
        </>
      )}
      <ActionTxStatus isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} hash={hash} />
    </div>
  );
}
