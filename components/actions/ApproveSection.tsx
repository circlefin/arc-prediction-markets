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

import { useState } from "react";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApproveArct } from "@/hooks/useMarket";
import { COLLATERAL_DECIMALS, MARKET_ADDRESS } from "@/lib/contracts";
import { ActionTxStatus } from "./ActionTxStatus";

export function ApproveSection() {
  const [amount, setAmount] = useState("");
  const { approve, isPending, isConfirming, isSuccess, error, hash } = useApproveArct(MARKET_ADDRESS);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Approve ARCT spending for the market contract before creating positions or other actions.
      </p>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="ARCT amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          onClick={() => approve(parseUnits(amount || "0", COLLATERAL_DECIMALS))}
          disabled={isPending || isConfirming || !amount}
        >
          Approve
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setAmount("1000000");
            approve(parseUnits("1000000", COLLATERAL_DECIMALS));
          }}
          disabled={isPending || isConfirming}
        >
          Max
        </Button>
      </div>
      <ActionTxStatus isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} hash={hash} />
    </div>
  );
}
