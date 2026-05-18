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
import { parseUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/contexts/WalletContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMarketState,
  useTokenBalances,
  useOracleState,
  useSettlePosition,
  useProposePriceWithTimer,
  useDisputePrice,
  useSettleOracleRequest,
  useApproveArct,
  useOracleAllowance,
  useSettleOracleWithTimer,
} from "@/hooks/useMarket";
import {
  useAMMState,
  useCalcBuy,
  useCalcSell,
  useBuyYes,
  useBuyNo,
  useSellYes,
  useSellNo,
  useApproveArctForAMM,
  useApproveTokenForAMM,
  useAMMAllowances,
} from "@/hooks/useAMM";
import { COLLATERAL_DECIMALS, OO_V2_ADDRESS, OracleState } from "@/lib/contracts";
import { BuyTab } from "./BuyTab";
import { SellTab } from "./SellTab";
import { ResolveTab } from "./ResolveTab";

type Tab = "buy" | "sell" | "resolve";
type Outcome = "yes" | "no";

export function TradingPanel() {
  const { isConnected } = useWallet();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("buy");
  const [outcome, setOutcome] = useState<Outcome>("yes");
  const [amount, setAmount] = useState("");

  const {
    priceRequested,
    receivedSettlementPrice,
    settlementPrice,
    longTokenAddress,
    shortTokenAddress,
    priceIdentifier,
    requestTimestamp,
    ancillaryDataHex,
    proposerBond,
    isLoading: isMarketLoading,
    refetch: refetchMarket,
  } = useMarketState();

  const { longBalance, shortBalance, isLoading: isBalancesLoading, refetch: refetchBalances } = useTokenBalances(
    longTokenAddress,
    shortTokenAddress
  );

  const { yesPrice, noPrice, initialized: ammInitialized, refetch: refetchAMM, isLoading: isAMMLoading } = useAMMState();

  const { arctAllowance, longAllowance, shortAllowance, isLoading: isAllowancesLoading, refetch: refetchAllowances } =
    useAMMAllowances(longTokenAddress, shortTokenAddress);

  const { oracleAllowance, isLoading: isOracleAllowanceLoading, refetch: refetchOracleAllowance } = useOracleAllowance();

  const {
    oracleState,
    proposer,
    proposedPrice,
    expirationTime,
    bond,
    refetch: refetchOracle,
  } = useOracleState(priceIdentifier, requestTimestamp, ancillaryDataHex);

  // AMM hooks
  const approveArct = useApproveArctForAMM();
  const approveLong = useApproveTokenForAMM(longTokenAddress);
  const approveShort = useApproveTokenForAMM(shortTokenAddress);
  const buyYes = useBuyYes();
  const buyNo = useBuyNo();
  const sellYesHook = useSellYes();
  const sellNoHook = useSellNo();
  const settlePos = useSettlePosition();

  // OO hooks
  const approveArctForOO = useApproveArct(OO_V2_ADDRESS);
  const proposePrice = useProposePriceWithTimer(priceIdentifier, requestTimestamp, ancillaryDataHex);
  const disputePrice = useDisputePrice(priceIdentifier, requestTimestamp, ancillaryDataHex);
  const settleOracle = useSettleOracleRequest(priceIdentifier, requestTimestamp, ancillaryDataHex);
  const settleOracleWithTimer = useSettleOracleWithTimer(priceIdentifier, requestTimestamp, ancillaryDataHex);

  // Preview calculations
  const { tokensOut: buyPreview } = useCalcBuy(outcome, tab === "buy" ? amount : "");
  const { collateralOut: sellPreview } = useCalcSell(outcome, tab === "sell" ? amount : "");

  useEffect(() => setMounted(true), []);

  // Auto-switch to resolve tab when market is settled
  useEffect(() => {
    if (receivedSettlementPrice) setTab("resolve");
  }, [receivedSettlementPrice]);

  // Refetch allowances after approvals
  useEffect(() => {
    if (approveArct.isSuccess || approveLong.isSuccess || approveShort.isSuccess || approveArctForOO.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['readContracts'] });
      queryClient.invalidateQueries({ queryKey: ['readContract'] });
      refetchAllowances();
      refetchOracleAllowance();
    }
  }, [approveArct.isSuccess, approveLong.isSuccess, approveShort.isSuccess, approveArctForOO.isSuccess, queryClient, refetchAllowances, refetchOracleAllowance]);

  // Refetch everything after trades, settle, oracle actions
  useEffect(() => {
    if (buyYes.isSuccess || buyNo.isSuccess || sellYesHook.isSuccess || sellNoHook.isSuccess ||
      settlePos.isSuccess || proposePrice.isSuccess || disputePrice.isSuccess || settleOracle.isSuccess ||
      settleOracleWithTimer.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['readContracts'] });
      queryClient.invalidateQueries({ queryKey: ['readContract'] });
      refetchAMM();
      refetchAllowances();
      refetchBalances();
      refetchMarket();
      refetchOracle();
    }
  }, [buyYes.isSuccess, buyNo.isSuccess, sellYesHook.isSuccess, sellNoHook.isSuccess,
  settlePos.isSuccess, proposePrice.isSuccess, disputePrice.isSuccess, settleOracle.isSuccess,
  settleOracleWithTimer.isSuccess,
    queryClient, refetchAMM, refetchAllowances, refetchBalances, refetchMarket, refetchOracle]);

  const isOracleSettlementRefreshing =
    (settleOracle.isSuccess || settleOracleWithTimer.isSuccess) &&
    !receivedSettlementPrice &&
    oracleState !== OracleState.Settled;

  useEffect(() => {
    if (!isOracleSettlementRefreshing) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["readContracts"] });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      refetchMarket();
      refetchOracle();
    }, 1_000);

    return () => clearInterval(interval);
  }, [isOracleSettlementRefreshing, queryClient, refetchMarket, refetchOracle]);

  const amountBigInt = amount
    ? parseUnits(amount, COLLATERAL_DECIMALS)
    : 0n;

  const needsBuyApproval =
    tab === "buy" && !approveArct.isSuccess && arctAllowance !== undefined &&
    arctAllowance === 0n;

  const needsSellApproval =
    tab === "sell" &&
    ((outcome === "yes" && !approveLong.isSuccess && longAllowance !== undefined && longAllowance === 0n) ||
      (outcome === "no" && !approveShort.isSuccess && shortAllowance !== undefined && shortAllowance === 0n));

  const needsOracleApproval =
    !approveArctForOO.isSuccess &&
    oracleAllowance !== undefined && proposerBond !== undefined &&
    oracleAllowance < proposerBond;

  if ((isMarketLoading || isAMMLoading || isBalancesLoading)) {
    return (
      <div className="rounded-xl border border-border bg-card sticky top-20">
        <div className="flex border-b border-border">
          {["buy", "sell", "resolve"].map((t) => (
            <div key={t} className="flex-1 flex justify-center py-3">
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-px w-full" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card sticky top-20">
      {/* Tab header */}
      <div className="flex border-b border-border">
        {(["buy", "sell", "resolve"] as Tab[]).map((t) => {
          const disabled = receivedSettlementPrice && (t === "buy" || t === "sell");
          return (
            <button
              key={t}
              onClick={() => { if (!disabled) { setTab(t); setAmount(""); } }}
              disabled={!!disabled}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${disabled
                ? "text-muted-foreground/40 cursor-not-allowed"
                : tab === t
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="p-4 space-y-4">
        {!mounted || !isConnected ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Connect your wallet to trade
          </p>
        ) : !ammInitialized && tab !== "resolve" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center py-6">
              AMM is not yet initialized. Deploy and seed the AMM contract first.
            </p>
          </div>
        ) : tab === "buy" ? (
          <BuyTab
            outcome={outcome}
            onOutcomeChange={setOutcome}
            amount={amount}
            onAmountChange={setAmount}
            yesPrice={yesPrice}
            noPrice={noPrice}
            buyPreview={buyPreview}
            needsApproval={needsBuyApproval}
            isAllowancesLoading={isAllowancesLoading}
            approveArct={approveArct}
            buyHook={outcome === "yes" ? buyYes : buyNo}
          />
        ) : tab === "sell" ? (
          <SellTab
            outcome={outcome}
            onOutcomeChange={setOutcome}
            amount={amount}
            onAmountChange={setAmount}
            yesPrice={yesPrice}
            noPrice={noPrice}
            longBalance={longBalance}
            shortBalance={shortBalance}
            sellPreview={sellPreview}
            needsApproval={needsSellApproval}
            isAllowancesLoading={isAllowancesLoading}
            approveHook={outcome === "yes" ? approveLong : approveShort}
            sellHook={outcome === "yes" ? sellYesHook : sellNoHook}
          />
        ) : (
          <ResolveTab
            oracleState={oracleState}
            priceRequested={priceRequested}
            receivedSettlementPrice={receivedSettlementPrice}
            settlementPrice={settlementPrice}
            longBalance={longBalance}
            shortBalance={shortBalance}
            proposer={proposer}
            proposedPrice={proposedPrice}
            expirationTime={expirationTime}
            bond={bond}
            needsOracleApproval={needsOracleApproval}
            isOracleAllowanceLoading={isOracleAllowanceLoading}
            approveArctForOO={approveArctForOO}
            proposePrice={proposePrice}
            disputePrice={disputePrice}
            settleOracle={settleOracle}
            settleOracleWithTimer={settleOracleWithTimer}
            isOracleSettlementRefreshing={isOracleSettlementRefreshing}
            settlePos={settlePos}
          />
        )}
      </div>
    </div>
  );
}
