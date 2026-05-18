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

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketDetail } from "@/components/MarketDetail";
import { TradingPanel } from "@/components/TradingPanel";
import { MARKET_ADDRESS, AMM_ADDRESS } from "@/lib/contracts";
import { MARKETS, type DynamicMarket } from "@/lib/markets";
import { MarketAddressProvider } from "@/contexts/MarketAddressContext";
import { type Address } from "viem";

function useResolveMarket(address: string) {
  const [resolved, setResolved] = useState<{
    marketAddress: Address;
    ammAddress: Address;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check static MARKETS first
    const staticMatch = MARKETS.find(
      (m) => m.address.toLowerCase() === address.toLowerCase() && m.isReal
    );
    if (staticMatch && staticMatch.ammAddress) {
      setResolved({
        marketAddress: staticMatch.address as Address,
        ammAddress: staticMatch.ammAddress as Address,
      });
      setLoading(false);
      return;
    }

    // Check dynamic markets
    fetch("/api/markets")
      .then((res) => res.json())
      .then((markets: DynamicMarket[]) => {
        const dynamicMatch = markets.find(
          (m) => m.address.toLowerCase() === address.toLowerCase()
        );
        if (dynamicMatch) {
          setResolved({
            marketAddress: dynamicMatch.address as Address,
            ammAddress: dynamicMatch.ammAddress as Address,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address]);

  return { resolved, loading };
}

export default function MarketPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const { resolved, loading } = useResolveMarket(address);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Markets
      </Link>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-secondary rounded" />
            <div className="h-4 w-full bg-secondary rounded" />
          </div>
        </div>
      ) : !resolved ? (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-6 text-center space-y-2">
          <p className="font-medium">Market not found</p>
          <p className="text-sm text-muted-foreground">
            This market address does not match any configured contract.
          </p>
        </div>
      ) : (
        <MarketAddressProvider
          marketAddress={resolved.marketAddress}
          ammAddress={resolved.ammAddress}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
            <MarketDetail />
            <TradingPanel />
          </div>
        </MarketAddressProvider>
      )}
    </div>
  );
}
