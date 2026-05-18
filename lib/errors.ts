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

/**
 * Parse raw blockchain/wallet errors into user-friendly messages.
 */
export function parseTxError(error: Error): { title: string; detail?: string } {
  const msg = error.message || "";

  // User rejected the transaction in their wallet
  if (
    msg.includes("User rejected") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    msg.includes("UserRejectedRequestError")
  ) {
    return { title: "Transaction rejected", detail: "You declined the transaction in your wallet." };
  }

  // Insufficient funds for gas
  if (
    msg.includes("insufficient funds") ||
    msg.includes("exceeds the balance")
  ) {
    return {
      title: "Insufficient funds",
      detail: "Your wallet doesn't have enough ETH to cover gas fees. Please add funds and try again.",
    };
  }

  // Allowance / approval issues
  if (msg.includes("insufficient allowance") || msg.includes("ERC20: insufficient allowance")) {
    return { title: "Approval required", detail: "You need to approve token spending before this transaction." };
  }

  // Transfer exceeds balance (trying to spend more tokens than owned)
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) {
    return { title: "Insufficient token balance", detail: "You don't have enough tokens for this transaction." };
  }

  // Generic contract revert
  if (msg.includes("reverted") || msg.includes("execution reverted")) {
    // Try to extract a reason string
    const reasonMatch = msg.match(/reason:\s*(.+?)(?:\n|$)/i) || msg.match(/reverted with reason string '(.+?)'/);
    const reason = reasonMatch?.[1]?.trim();
    return {
      title: "Transaction failed",
      detail: reason || "The contract rejected this transaction. The market state may have changed.",
    };
  }

  // Network / RPC errors
  if (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("could not detect network") ||
    msg.includes("failed to fetch")
  ) {
    return { title: "Network error", detail: "Could not reach the blockchain. Check your connection and try again." };
  }

  // Nonce issues
  if (msg.includes("nonce") && (msg.includes("too low") || msg.includes("already known"))) {
    return { title: "Transaction conflict", detail: "A pending transaction is blocking this one. Try again shortly." };
  }

  // Fallback - show a trimmed version of the raw message
  const short = msg.length > 150 ? msg.slice(0, 147) + "..." : msg;
  return { title: "Transaction failed", detail: short };
}
