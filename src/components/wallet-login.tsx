"use client";

import { useState } from "react";
import type { IdentitySession, NonceResponse } from "../lib/identity/contracts";
import { consoleApi } from "./console-api";
import { RequestError } from "./console-ui";
import { connectWallet, signWalletMessage } from "./wallet";

export function WalletLogin() {
  const [step, setStep] = useState<"idle" | "connecting" | "signing" | "verifying">("idle");
  const [error, setError] = useState<unknown>(null);
  async function login() {
    setError(null);
    setStep("connecting");
    try {
      const connection = await connectWallet();
      const nonce = await consoleApi<NonceResponse>("/api/auth/nonce", {
        purpose: "payr-login-v1",
        wallet: connection.wallet,
      });
      setStep("signing");
      const signature = await signWalletMessage(connection, nonce.message);
      setStep("verifying");
      await consoleApi<{ session: IdentitySession }>("/api/auth/verify", {
        nonceId: nonce.nonceId,
        signature,
      });
      // A document navigation drops any previous workspace's client state.
      window.location.replace("/app");
    } catch (failure) {
      setError(failure);
      setStep("idle");
    }
  }
  return (
    <div className="login-action">
      <button className="button" onClick={login} disabled={step !== "idle"}>
        {step === "idle"
          ? error
            ? "Try again"
            : "Connect wallet"
          : step === "connecting"
            ? "Connecting wallet..."
            : step === "signing"
              ? "Waiting for signature..."
              : "Verifying signature..."}
      </button>
      <p role="status" aria-live="polite">
        {step === "signing"
          ? "Review the Payr login message in your wallet. Signing does not send a transaction or authorize a payment."
          : step === "verifying"
            ? "Checking your signature and opening your workspace."
            : "Use an Ethereum browser wallet. Smart-account signatures are not supported yet."}
      </p>
      <RequestError error={error} />
    </div>
  );
}
