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
import { ChevronLeft } from "lucide-react";
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

type View = "main" | "passkey";

export function ConnectDialog() {
  const { connectMetaMask, connectCircle, isConnecting, circleError } = useWallet();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("main");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setView("main");
  };

  const handleMetaMask = () => {
    connectMetaMask();
    setOpen(false);
  };

  const handlePasskeyMode = async (mode: "login" | "register") => {
    // Close only on a real connection. If the user bails, aborts, or closes the
    // OS passkey dialog (or it errors), keep our dialog open on the passkey view
    // so they can retry.
    const connected = await connectCircle(mode);
    if (connected) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button disabled={isConnecting} />}
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </DialogTrigger>

      <DialogContent>
        {view === "passkey" && (
          <button
            onClick={() => setView("main")}
            disabled={isConnecting}
            className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div key={view} className="animate-in fade-in-0 duration-150 flex flex-col gap-4">
          {view === "main" && (
            <>
              <DialogHeader>
                <DialogTitle>Connect Wallet</DialogTitle>
                <DialogDescription>
                  Choose how you want to connect to Arc Borrow &amp; Lend.
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
                  onClick={() => setView("passkey")}
                  disabled={isConnecting || !isCircleConfigured()}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 font-bold text-lg">
                    P
                  </div>
                  <div>
                    <div className="font-medium">Passkey</div>
                    <div className="text-xs text-muted-foreground">
                      {!isCircleConfigured()
                        ? "Not configured — set Circle env vars in .env.local"
                        : "Sign in with biometrics (no extension needed)"}
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {view === "passkey" && (
            <>
              <DialogHeader className="px-7 text-center">
                <DialogTitle>Passkey Wallet</DialogTitle>
                <DialogDescription>
                  Sign in with an existing passkey or create a new wallet.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handlePasskeyMode("login")}
                  disabled={isConnecting}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-xl">
                    🔑
                  </div>
                  <div>
                    <div className="font-medium">Sign in with existing passkey</div>
                    <div className="text-xs text-muted-foreground">
                      Use a passkey you already created
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handlePasskeyMode("register")}
                  disabled={isConnecting}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600 text-xl">
                    ✨
                  </div>
                  <div>
                    <div className="font-medium">Create new wallet</div>
                    <div className="text-xs text-muted-foreground">
                      Register a new passkey and get a new wallet address
                    </div>
                  </div>
                </button>

                {circleError && (
                  <p className="text-xs text-destructive">{circleError}</p>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
