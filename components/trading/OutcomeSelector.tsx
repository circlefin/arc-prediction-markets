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

type Outcome = "yes" | "no";

interface OutcomeSelectorProps {
  outcome: Outcome;
  onSelect: (outcome: Outcome) => void;
  label?: string;
  yesPrice?: number;
  noPrice?: number;
}

export function OutcomeSelector({ outcome, onSelect, label = "Outcome", yesPrice, noPrice }: OutcomeSelectorProps) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onSelect("yes")}
          className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${outcome === "yes"
            ? "bg-green-600 text-white"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
        >
          Yes {yesPrice !== undefined ? `${Math.round(yesPrice)}¢` : ""}
        </button>
        <button
          onClick={() => onSelect("no")}
          className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${outcome === "no"
            ? "bg-red-500 text-white"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
        >
          No {noPrice !== undefined ? `${Math.round(noPrice)}¢` : ""}
        </button>
      </div>
    </div>
  );
}
