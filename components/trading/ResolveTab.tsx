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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCollateral, oracleStateLabel } from "@/hooks/market/helpers";
import { OracleState, COLLATERAL_DECIMALS } from "@/lib/contracts";
import { TxStatus, type TxStatusProps } from "./TxStatus";

interface ResolveTabProps {
  oracleState: OracleState | undefined;
  priceRequested: boolean | undefined;
  receivedSettlementPrice: boolean | undefined;
  settlementPrice: bigint | undefined;
  longBalance: bigint | undefined;
  shortBalance: bigint | undefined;
  proposer: string | undefined;
  proposedPrice: bigint | undefined;
  expirationTime: bigint | undefined;
  bond: bigint | undefined;
  needsOracleApproval: boolean;
  isOracleAllowanceLoading: boolean;
  approveArctForOO: TxStatusProps & { approve: (amount: bigint) => void };
  proposePrice: TxStatusProps & { propose: (price: bigint) => void };
  disputePrice: TxStatusProps & { dispute: () => void };
  settleOracle: TxStatusProps & { settleOracle: () => void };
  settleOracleWithTimer: TxStatusProps & { settleOracle: () => void };
  isOracleSettlementRefreshing: boolean;
  settlePos: TxStatusProps & { settle: (longAmt: bigint, shortAmt: bigint) => void };
}

export function ResolveTab({
  oracleState,
  priceRequested,
  receivedSettlementPrice,
  settlementPrice,
  longBalance,
  shortBalance,
  proposer,
  proposedPrice,
  expirationTime,
  bond,
  needsOracleApproval,
  isOracleAllowanceLoading,
  approveArctForOO,
  proposePrice,
  disputePrice,
  settleOracle,
  settleOracleWithTimer,
  isOracleSettlementRefreshing,
  settlePos,
}: ResolveTabProps) {
  const [longSettleAmt, setLongSettleAmt] = useState("");
  const [shortSettleAmt, setShortSettleAmt] = useState("");
  const [disputeEscalated, setDisputeEscalated] = useState(false);

  useEffect(() => {
    if (proposePrice.isSuccess) setDisputeEscalated(false);
  }, [proposePrice.isSuccess]);

  useEffect(() => {
    if (disputePrice.isSuccess) setDisputeEscalated(true);
  }, [disputePrice.isSuccess]);

  // Once the user sees "Disputed", freeze the display there until they
  // leave/reload. Prevents the Disputed → Unknown → No Proposal Yet blink.
  const [disputeSticky, setDisputeSticky] = useState(false);
  useEffect(() => {
    if (oracleState === OracleState.Disputed) setDisputeSticky(true);
  }, [oracleState]);

  const displayOracleState = disputeSticky && oracleState !== OracleState.Proposed && oracleState !== OracleState.Expired && oracleState !== OracleState.Resolved && oracleState !== OracleState.Settled
    ? OracleState.Disputed
    : oracleState;

  useEffect(() => {
    if (settlePos.isSuccess) {
      setLongSettleAmt("");
      setShortSettleAmt("");
    }
  }, [settlePos.isSuccess]);

  // Countdown for proposal expiration
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const expirationSeconds = expirationTime !== undefined ? Number(expirationTime) - now : undefined;
  const expirationDisplay = expirationSeconds !== undefined && expirationSeconds > 0
    ? `${Math.floor(expirationSeconds / 60)}m ${expirationSeconds % 60}s`
    : undefined;
  const isSettleOracleBusy =
    settleOracle.isPending ||
    settleOracle.isConfirming ||
    isOracleSettlementRefreshing;
  const isSettleOracleWithTimerBusy =
    settleOracleWithTimer.isPending ||
    settleOracleWithTimer.isConfirming ||
    isOracleSettlementRefreshing;

  return (
    <div className="space-y-4">
      {/* Oracle status badge */}
      <div className="rounded-lg bg-muted/50 border p-3 text-center">
        <p className="text-xs text-muted-foreground mb-1">Oracle Status</p>
        <p className="font-mono text-sm font-semibold">
          {oracleStateLabel(displayOracleState, { priceRequested: !!priceRequested })}
        </p>
      </div>

      {/* Phase 1: Awaiting proposal */}
      {(oracleState === OracleState.Requested || oracleState === OracleState.Disputed || (oracleState === OracleState.Invalid && priceRequested) || (disputeEscalated && disputePrice.isSuccess)) && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            No one has proposed a resolution yet. Propose YES (1e18), NO (0), or Undetermined (5e17).
            Requires a bond of {bond !== undefined ? formatCollateral(bond) : "..."} ARCT.
          </p>
          {isOracleAllowanceLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : needsOracleApproval ? (
            <>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => approveArctForOO.approve(parseUnits("1000000", COLLATERAL_DECIMALS))}
                disabled={approveArctForOO.isPending || approveArctForOO.isConfirming}
              >
                {approveArctForOO.isPending || approveArctForOO.isConfirming
                  ? "Approving..."
                  : "Approve ARCT for Oracle"}
              </Button>
              <TxStatus {...approveArctForOO} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => proposePrice.propose(BigInt("1000000000000000000"))}
                  disabled={proposePrice.isPending || proposePrice.isConfirming}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  className="bg-red-500 hover:bg-red-600 text-white"
                  onClick={() => proposePrice.propose(0n)}
                  disabled={proposePrice.isPending || proposePrice.isConfirming}
                >
                  No
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => proposePrice.propose(BigInt("500000000000000000"))}
                  disabled={proposePrice.isPending || proposePrice.isConfirming}
                >
                  Undetermined
                </Button>
              </div>
              <TxStatus {...proposePrice} />
            </>
          )}
        </div>
      )}

      {/* Phase 2: Proposal active - can dispute */}
      {oracleState === OracleState.Proposed && (
        <div className="space-y-3">
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Proposed Resolution</p>
            <p className="font-mono text-lg font-semibold">
              {proposedPrice !== undefined
                ? proposedPrice >= BigInt("1000000000000000000") ? "YES"
                  : proposedPrice === 0n ? "NO"
                    : proposedPrice === BigInt("500000000000000000") ? "UNDETERMINED"
                      : `${formatUnits(proposedPrice, 18)}`
                : "..."}
            </p>
            <p className="text-xs text-muted-foreground">
              by {proposer ? `${proposer.slice(0, 6)}...${proposer.slice(-4)}` : "..."}
            </p>
            {expirationDisplay && (
              <p className="text-xs text-yellow-500 font-mono">
                Dispute window: {expirationDisplay}
              </p>
            )}
          </div>
          {isOracleAllowanceLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : needsOracleApproval ? (
            <>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => approveArctForOO.approve(parseUnits("1000000", COLLATERAL_DECIMALS))}
                disabled={approveArctForOO.isPending || approveArctForOO.isConfirming}
              >
                {approveArctForOO.isPending || approveArctForOO.isConfirming
                  ? "Approving..."
                  : "Approve ARCT for Oracle"}
              </Button>
              <TxStatus {...approveArctForOO} />
            </>
          ) : expirationSeconds !== undefined && expirationSeconds <= 0 ? (
            <>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => settleOracleWithTimer.settleOracle()}
                disabled={isSettleOracleWithTimerBusy}
              >
                {isSettleOracleWithTimerBusy
                  ? isOracleSettlementRefreshing
                    ? "Finalizing Oracle..."
                    : "Settling Oracle..."
                  : "Settle Oracle Request"}
              </Button>
              <TxStatus {...settleOracleWithTimer} />
              {isOracleSettlementRefreshing && (
                <p className="text-xs text-blue-500">
                  Refreshing oracle state until settlement is fully reflected in the UI...
                </p>
              )}
            </>
          ) : (
            <>
              <Button
                className="w-full text-red-500 border-red-500/30 hover:bg-red-500/10"
                variant="outline"
                onClick={() => disputePrice.dispute()}
                disabled={disputePrice.isPending || disputePrice.isConfirming}
              >
                {disputePrice.isPending || disputePrice.isConfirming ? "Disputing..." : "Dispute"}
              </Button>
              <TxStatus {...disputePrice} />
            </>
          )}
        </div>
      )}

      {/* Phase 3: Expired or Resolved - settle the OO request */}
      {(oracleState === OracleState.Expired || oracleState === OracleState.Resolved) && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The oracle request is ready to be settled. Anyone can call settle to finalize the resolution.
          </p>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => settleOracle.settleOracle()}
            disabled={isSettleOracleBusy}
          >
            {isSettleOracleBusy
              ? isOracleSettlementRefreshing
                ? "Finalizing Oracle..."
                : "Settling Oracle..."
              : "Settle Oracle Request"}
          </Button>
          <TxStatus {...settleOracle} />
          {isOracleSettlementRefreshing && (
            <p className="text-xs text-blue-500">
              Refreshing oracle state until settlement is fully reflected in the UI...
            </p>
          )}
        </div>
      )}

      {/* Phase 5: Market settled - redeem tokens */}
      {(receivedSettlementPrice || oracleState === OracleState.Settled) && (() => {
        const price = settlementPrice !== undefined ? Number(settlementPrice) / 1e18 : undefined;
        const longPaysOut = price !== undefined && price > 0;
        const shortPaysOut = price !== undefined && price < 1;
        const redeemableLong = longPaysOut ? longBalance ?? 0n : 0n;
        const redeemableShort = shortPaysOut ? shortBalance ?? 0n : 0n;
        const hasRedeemableTokens = redeemableLong > 0n || redeemableShort > 0n;

        const priceLabel = settlementPrice !== undefined
          ? settlementPrice === BigInt("1000000000000000000") ? "YES (1.0)"
            : settlementPrice === 0n ? "NO (0.0)"
              : settlementPrice === BigInt("500000000000000000") ? "UNDETERMINED (0.5)"
                : String(price)
          : "...";

        return (
          <>
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
              <p className="text-xs text-muted-foreground">Settlement Price</p>
              <p className="font-mono text-lg text-green-500">{priceLabel}</p>
            </div>

            {!hasRedeemableTokens ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {(!longBalance && !shortBalance)
                  ? "Market resolved. You have no tokens to settle."
                  : `Market resolved to ${price === 1 ? "Yes" : price === 0 ? "No" : price}. Your ${longBalance ? "Yes" : "No"} tokens have no payout.`}
              </p>
            ) : receivedSettlementPrice ? (
              <>
                <div className={redeemableLong > 0n && redeemableShort > 0n ? "grid grid-cols-2 gap-2" : ""}>
                  {redeemableLong > 0n && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Yes tokens
                        <span className="float-right font-mono">{formatCollateral(redeemableLong)}</span>
                      </p>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        max={formatCollateral(redeemableLong, true)}
                        value={longSettleAmt}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw || parseFloat(raw) <= 0) {
                            setLongSettleAmt(raw);
                            return;
                          }
                          const parsed = parseUnits(raw, COLLATERAL_DECIMALS);
                          if (parsed > redeemableLong) {
                            setLongSettleAmt(formatUnits(redeemableLong, COLLATERAL_DECIMALS));
                          } else {
                            setLongSettleAmt(raw);
                          }
                        }}
                        className="font-mono"
                      />
                    </div>
                  )}
                  {redeemableShort > 0n && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        No tokens
                        <span className="float-right font-mono">{formatCollateral(redeemableShort)}</span>
                      </p>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        max={formatCollateral(redeemableShort, true)}
                        value={shortSettleAmt}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw || parseFloat(raw) <= 0) {
                            setShortSettleAmt(raw);
                            return;
                          }
                          const parsed = parseUnits(raw, COLLATERAL_DECIMALS);
                          if (parsed > redeemableShort) {
                            setShortSettleAmt(formatUnits(redeemableShort, COLLATERAL_DECIMALS));
                          } else {
                            setShortSettleAmt(raw);
                          }
                        }}
                        className="font-mono"
                      />
                    </div>
                  )}
                </div>

                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    const longVal = longSettleAmt ? parseUnits(longSettleAmt, COLLATERAL_DECIMALS) : 0n;
                    const shortVal = shortSettleAmt ? parseUnits(shortSettleAmt, COLLATERAL_DECIMALS) : 0n;
                    settlePos.settle(
                      longVal > redeemableLong ? redeemableLong : longVal,
                      shortVal > redeemableShort ? redeemableShort : shortVal,
                    );
                  }}
                  disabled={
                    settlePos.isPending ||
                    settlePos.isConfirming ||
                    (!Number(longSettleAmt) && !Number(shortSettleAmt))
                  }
                >
                  {settlePos.isPending || settlePos.isConfirming
                    ? "Settling..."
                    : "Settle Position"}
                </Button>
                <TxStatus {...settlePos} />
              </>
            ) : null}
          </>
        );
      })()}
    </div>
  );
}
