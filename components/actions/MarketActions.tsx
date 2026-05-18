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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/contexts/WalletContext";
import { ApproveSection } from "./ApproveSection";
import { CreateSection } from "./CreateSection";
import { RedeemSection } from "./RedeemSection";
import { SettleSection } from "./SettleSection";

export function MarketActions() {
  const { isConnected } = useWallet();

  if (!isConnected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="approve">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="approve">Approve</TabsTrigger>
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="redeem">Redeem</TabsTrigger>
            <TabsTrigger value="settle">Settle</TabsTrigger>
          </TabsList>
          <div className="mt-4">
            <TabsContent value="approve"><ApproveSection /></TabsContent>
            <TabsContent value="create"><CreateSection /></TabsContent>
            <TabsContent value="redeem"><RedeemSection /></TabsContent>
            <TabsContent value="settle"><SettleSection /></TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
