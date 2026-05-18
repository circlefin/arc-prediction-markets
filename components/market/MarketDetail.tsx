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

import { useMarketState, useTokenBalances, useOracleState } from "@/hooks/useMarket";
import { useAMMState } from "@/hooks/useAMM";
import { useWallet } from "@/contexts/WalletContext";
import { MarketHeader } from "./MarketHeader";
import { MarketStatusSection } from "./MarketStatusSection";
import { ProbabilityBar } from "./ProbabilityBar";
import { PortfolioSection } from "./PortfolioSection";

export function MarketDetail() {
  const {
    pairName,
    question,
    priceRequested,
    receivedSettlementPrice,
    settlementPrice,
    longTokenAddress,
    shortTokenAddress,
    priceIdentifier,
    requestTimestamp,
    ancillaryDataHex,
    isLoading,
  } = useMarketState();
  const { address } = useWallet();
  const { arctBalance, longBalance, shortBalance } =
    useTokenBalances(longTokenAddress, shortTokenAddress);

  const {
    yesPrice,
    noPrice,
    initialized: ammInitialized,
    isLoading: isAMMLoading,
  } = useAMMState();

  const { oracleState, expirationTime } = useOracleState(priceIdentifier, requestTimestamp, ancillaryDataHex);

  if (isLoading || isAMMLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-secondary rounded" />
          <div className="h-4 w-full bg-secondary rounded" />
          <div className="h-4 w-3/4 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MarketHeader
        pairName={pairName}
        question={question}
        priceRequested={priceRequested}
        receivedSettlementPrice={receivedSettlementPrice}
        settlementPrice={settlementPrice}
      />

      <MarketStatusSection
        oracleState={oracleState}
        priceRequested={priceRequested}
        receivedSettlementPrice={receivedSettlementPrice}
        expirationTime={expirationTime}
      />

      <ProbabilityBar
        yesPrice={yesPrice}
        noPrice={noPrice}
        ammInitialized={ammInitialized}
        receivedSettlementPrice={receivedSettlementPrice}
      />

      {address && (
        <PortfolioSection
          arctBalance={arctBalance}
          longBalance={longBalance}
          shortBalance={shortBalance}
          yesPrice={yesPrice}
          noPrice={noPrice}
        />
      )}
    </div>
  );
}
