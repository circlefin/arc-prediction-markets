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
import { oracleStateLabel } from "@/hooks/market/helpers";
import { OracleState } from "@/lib/contracts";

interface MarketStatusSectionProps {
  oracleState: OracleState | undefined;
  priceRequested: boolean | undefined;
  receivedSettlementPrice: boolean | undefined;
  expirationTime: bigint | undefined;
}

export function MarketStatusSection({
  oracleState,
  priceRequested,
  receivedSettlementPrice,
  expirationTime,
}: MarketStatusSectionProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const expirationSeconds = expirationTime !== undefined ? Number(expirationTime) - now : undefined;

  // Once the user sees "Disputed", freeze the display there until they
  // leave/reload. Prevents the Disputed → Unknown → No Proposal Yet blink.
  const [disputeSticky, setDisputeSticky] = useState(false);
  useEffect(() => {
    if (oracleState === OracleState.Disputed) setDisputeSticky(true);
  }, [oracleState]);

  const displayState = disputeSticky && oracleState !== OracleState.Proposed && oracleState !== OracleState.Expired && oracleState !== OracleState.Resolved && oracleState !== OracleState.Settled
    ? OracleState.Disputed
    : oracleState;

  if (!priceRequested || receivedSettlementPrice || displayState === undefined) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Market Status
      </h2>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${displayState === OracleState.Requested ? "bg-amber-500 animate-pulse" :
            displayState === OracleState.Proposed ? "bg-blue-500" :
              displayState === OracleState.Expired || displayState === OracleState.Resolved ? "bg-green-500" :
                displayState === OracleState.Disputed ? "bg-red-500" :
                  displayState === OracleState.Invalid && priceRequested ? "bg-red-400" :
                    "bg-muted-foreground"
          }`} />
        <span className="font-medium">
          {oracleStateLabel(displayState, { priceRequested: !!priceRequested })}
        </span>
      </div>

      {displayState === OracleState.Requested && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-sm font-medium text-amber-400">Awaiting Proposal</p>
          <p className="text-xs text-muted-foreground mt-1">
            The market is open and waiting for someone to propose a resolution.
            Anyone can propose YES, NO, or Undetermined via the Resolve tab.
          </p>
        </div>
      )}

      {displayState === OracleState.Proposed && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 space-y-2">
          <p className="text-sm font-medium text-blue-400">Proposal Active</p>
          <p className="text-xs text-muted-foreground">
            A resolution has been proposed. It can be disputed during the liveness window. Trading remains open.
          </p>
          {expirationSeconds !== undefined && (
            expirationSeconds > 0 ? (
              <p className="text-sm font-mono text-yellow-500">
                Dispute window: {Math.floor(expirationSeconds / 3600) > 0 ? `${Math.floor(expirationSeconds / 3600)}h ` : ""}
                {Math.floor((expirationSeconds % 3600) / 60)}m {expirationSeconds % 60}s
              </p>
            ) : (
              <p className="text-sm font-mono text-green-500">
                Liveness expired - ready to settle
              </p>
            )
          )}
        </div>
      )}

      {(displayState === OracleState.Expired || displayState === OracleState.Resolved) && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
          <p className="text-sm font-medium text-green-400">Ready to Settle</p>
          <p className="text-xs text-muted-foreground mt-1">
            The liveness window has passed. Settle the oracle request via the Resolve tab to finalize the market.
          </p>
        </div>
      )}

      {displayState === OracleState.Disputed && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm font-medium text-red-400">Dispute Submitted</p>
          <p className="text-xs text-muted-foreground mt-1">
            The proposed price was disputed. The dispute has been escalated to UMA&apos;s DVM for arbitration.
            A new price request will be made once the DVM resolves.
          </p>
        </div>
      )}

      {displayState === OracleState.Invalid && priceRequested && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm font-medium text-red-400">Dispute Escalated</p>
          <p className="text-xs text-muted-foreground mt-1">
            A previous proposal was disputed and escalated to UMA&apos;s DVM for arbitration.
            The market remains open for trading. A new proposal can be submitted.
          </p>
        </div>
      )}
    </div>
  );
}
