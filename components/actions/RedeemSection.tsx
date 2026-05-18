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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useMarketState, useTokenBalances, useRedeemPosition, formatCollateral } from "@/hooks/useMarket";
import { ActionTxStatus } from "./ActionTxStatus";

export function RedeemSection() {
  const [amount, setAmount] = useState("");
  const { longTokenAddress, shortTokenAddress } = useMarketState();
  const { longBalance, shortBalance } = useTokenBalances(longTokenAddress, shortTokenAddress);
  const { redeem, isPending, isConfirming, isSuccess, error, hash } = useRedeemPosition();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);

  const maxRedeem = longBalance && shortBalance
    ? (longBalance < shortBalance ? longBalance : shortBalance)
    : 0n;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Burn equal amounts of Long and Short tokens to get ARCT back (1:1).
        Max redeemable: {formatCollateral(maxRedeem)} ARCT
      </p>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Amount to redeem"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          onClick={() => redeem(amount)}
          disabled={isPending || isConfirming || !amount || maxRedeem === 0n}
        >
          Redeem
        </Button>
      </div>
      <ActionTxStatus isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} hash={hash} />
    </div>
  );
}
