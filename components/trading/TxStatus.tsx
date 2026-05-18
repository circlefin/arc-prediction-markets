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

import { parseTxError } from "@/lib/errors";

export interface TxStatusProps {
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: Error | null;
  hash: `0x${string}` | undefined;
}

export function TxStatus({
  isPending,
  isConfirming,
  isSuccess,
  error,
  hash,
}: TxStatusProps) {
  if (isPending)
    return <p className="text-xs text-yellow-500">Confirm in wallet...</p>;
  if (isConfirming)
    return <p className="text-xs text-blue-500">Waiting for confirmation...</p>;
  if (isSuccess && hash) {
    return (
      <p className="text-xs text-green-500">
        Success!{" "}
        <a
          href={`https://testnet.arcscan.app/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          View tx
        </a>
      </p>
    );
  }
  if (error) {
    const { title, detail } = parseTxError(error);
    return (
      <div className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-500">
        <p className="font-medium">{title}</p>
        {detail && <p className="mt-0.5 text-red-400">{detail}</p>}
      </div>
    );
  }
  return null;
}
