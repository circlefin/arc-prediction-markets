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

import { useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CopyableText({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setOpen(true);
    setTimeout(() => setOpen(false), 1500);
  }, [value]);

  return (
    <Popover open={open}>
      <PopoverTrigger
        onClick={handleCopy}
        className="cursor-pointer underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground hover:bg-muted rounded-sm px-0.5 -mx-0.5 transition-colors"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-auto px-3 py-1.5 text-xs font-medium">
        Copied!
      </PopoverContent>
    </Popover>
  );
}
