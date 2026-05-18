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
import { useMarketState, useCreatePosition } from "@/hooks/useMarket";
import { ActionTxStatus } from "./ActionTxStatus";

export function CreateSection() {
  const [amount, setAmount] = useState("");
  const { priceRequested } = useMarketState();
  const { create, isPending, isConfirming, isSuccess, error, hash } = useCreatePosition();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Deposit ARCT to mint equal amounts of Long (YES) and Short (NO) tokens.
        You must approve ARCT first.
      </p>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="ARCT amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          onClick={() => create(amount)}
          disabled={isPending || isConfirming || !amount || !priceRequested}
        >
          Create Position
        </Button>
      </div>
      {!priceRequested && (
        <p className="text-sm text-yellow-500">Market must be initialized first.</p>
      )}
      <ActionTxStatus isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} hash={hash} />
    </div>
  );
}
