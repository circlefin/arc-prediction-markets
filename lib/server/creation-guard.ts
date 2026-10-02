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

export interface GuardOptions {
  /** Minimum time between two market creations, whoever asks. */
  cooldownMs: number;
  /** Per-client limit: at most `perClientMax` creations per `perClientWindowMs`. */
  perClientMax: number;
  perClientWindowMs: number;
  now?: () => number;
}

export type Acquired =
  | { ok: true; release: (outcome: "created" | "failed") => void }
  | { ok: false; status: 429 | 503; error: string; retryAfterSeconds: number };

/**
 * Stops a public endpoint that spends the server's key from being used as a tap.
 *
 *  - Single flight: one creation at a time. A creation takes minutes and does many
 *    transactions from one account with a nonce manager; overlapping ones both collide and
 *    multiply the spend.
 *  - Cooldown: a minimum gap between creations, for everyone together.
 *  - Per-client window: best effort, keyed by the caller's address. Behind a proxy that
 *    does not overwrite X-Forwarded-For it can be spoofed, so the global cooldown is the
 *    control that always holds.
 *
 * State is in memory, so it is per server instance. It bounds a single instance's spend;
 * a multi-instance deployment needs a shared store or an authenticated caller.
 */
export function createCreationGuard({ cooldownMs, perClientMax, perClientWindowMs, now = Date.now }: GuardOptions) {
  let inFlight = false;
  let lastFinishedAt = -Infinity;
  const attempts = new Map<string, number[]>();

  return function acquire(clientKey: string): Acquired {
    const t = now();

    if (inFlight) {
      return { ok: false, status: 503, error: "A market is being created. Try again in a few minutes.", retryAfterSeconds: 60 };
    }

    const sinceLast = t - lastFinishedAt;
    if (sinceLast < cooldownMs) {
      return {
        ok: false,
        status: 429,
        error: "Markets can only be created every so often. Try again shortly.",
        retryAfterSeconds: Math.ceil((cooldownMs - sinceLast) / 1000),
      };
    }

    const recent = (attempts.get(clientKey) ?? []).filter((time) => t - time < perClientWindowMs);
    if (recent.length >= perClientMax) {
      return {
        ok: false,
        status: 429,
        error: "You have created too many markets recently. Try again later.",
        retryAfterSeconds: Math.ceil((perClientWindowMs - (t - recent[0])) / 1000),
      };
    }

    inFlight = true;
    attempts.set(clientKey, [...recent, t]);
    // Do not grow without bound under a flood of distinct client keys.
    if (attempts.size > 10_000) attempts.clear();

    return {
      ok: true,
      release(outcome) {
        inFlight = false;
        // A failed creation should not lock everyone out for the cooldown.
        if (outcome === "created") lastFinishedAt = now();
      },
    };
  };
}
