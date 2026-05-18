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
import { useMarketState, useTokenBalances, formatCollateral } from "@/hooks/useMarket";
import { useWallet } from "@/contexts/WalletContext";

export function TokenBalances() {
  const { address } = useWallet();
  const { longTokenAddress, shortTokenAddress } = useMarketState();
  const { arctBalance, longBalance, shortBalance, arctAllowance } =
    useTokenBalances(longTokenAddress, shortTokenAddress);

  if (!address) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Balances</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">ARCT</p>
            <p className="font-mono text-lg">{formatCollateral(arctBalance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Long (YES)</p>
            <p className="font-mono text-lg text-green-500">
              {formatCollateral(longBalance)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Short (NO)</p>
            <p className="font-mono text-lg text-red-500">
              {formatCollateral(shortBalance)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">ARCT Allowance</p>
            <p className="font-mono text-lg">{formatCollateral(arctAllowance)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
