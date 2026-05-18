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

interface ProbabilityBarProps {
  yesPrice: number | undefined;
  noPrice: number | undefined;
  ammInitialized: boolean | undefined;
  receivedSettlementPrice: boolean | undefined;
}

export function ProbabilityBar({
  yesPrice,
  noPrice,
  ammInitialized,
  receivedSettlementPrice,
}: ProbabilityBarProps) {
  const yesPct = yesPrice !== undefined ? Math.round(yesPrice) : null;
  const noPct = noPrice !== undefined ? Math.round(noPrice) : null;

  if (!ammInitialized || receivedSettlementPrice || yesPct === null || noPct === null) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Market Probability
      </h2>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold text-green-500">{yesPct}%</span>
        <span className="text-sm text-muted-foreground">chance of Yes</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div
          className="bg-green-500 transition-all duration-500"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="bg-red-400 transition-all duration-500"
          style={{ width: `${noPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Yes {yesPrice !== undefined ? (yesPrice / 100).toFixed(2) : "--"} ARCT</span>
        <span>No {noPrice !== undefined ? (noPrice / 100).toFixed(2) : "--"} ARCT</span>
      </div>
    </div>
  );
}
