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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { parseTxError } from "@/lib/errors";

interface CreateMarketDialogProps {
  onCreated: () => void;
}

export function CreateMarketDialog({ onCreated }: CreateMarketDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setIsCreating(true);
    setError(null);
    setStep("Deploying contracts on-chain...");

    try {
      const res = await fetch("/api/create-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create market");
      }

      setStep(null);
      setTitle("");
      setOpen(false);
      onCreated();
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Failed to create market");
      setError(parseTxError(e));
      setStep(null);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setStep(null); } }}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" />
        }
      >
        <Plus className="h-4 w-4" />
        Create Market
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Prediction Market</DialogTitle>
          <DialogDescription>
            Enter a question for your prediction market. This will deploy real contracts on Arc Testnet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Market Question
            </label>
            <Input
              placeholder="e.g. Will ETH reach $10,000 by 2027?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isCreating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim() && !isCreating) handleCreate();
              }}
            />
          </div>

          {step && (
            <div className="flex items-center gap-2 text-sm text-blue-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {step}
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <p className="font-medium">{error.title}</p>
              {error.detail && <p className="mt-0.5 text-xs text-red-400">{error.detail}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="w-full sm:w-auto"
          >
            {isCreating ? "Creating..." : "Create Market"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
