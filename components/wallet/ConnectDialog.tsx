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

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { isCircleConfigured } from "@/lib/circle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConnectDialog() {
  const { connectMetaMask, connectCircle, isConnecting, circleError } = useWallet();
  const [open, setOpen] = useState(false);

  const handleMetaMask = () => {
    connectMetaMask();
    setOpen(false);
  };

  const handlePasskey = async () => {
    await connectCircle();
    if (!circleError) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button disabled={isConnecting} />}
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Choose how you want to connect to the prediction market.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleMetaMask}
            disabled={isConnecting}
            className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600 font-bold text-lg">
              M
            </div>
            <div>
              <div className="font-medium">MetaMask</div>
              <div className="text-xs text-muted-foreground">
                Connect with browser extension
              </div>
            </div>
          </button>

          <button
            onClick={handlePasskey}
            disabled={isConnecting || !isCircleConfigured()}
            className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 font-bold text-lg">
              P
            </div>
            <div>
              <div className="font-medium">Passkey</div>
              <div className="text-xs text-muted-foreground">
                {!isCircleConfigured()
                  ? "Not configured, set Circle env vars in .env.local"
                  : isConnecting
                    ? "Connecting..."
                    : "Sign in with biometrics (no extension needed)"}
              </div>
            </div>
          </button>

          {circleError && (
            <p className="text-xs text-destructive">{circleError}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
