"use client";

import { useState } from "react";
import { walletSchema, type NonceResponse, type SenderProfile } from "../lib/identity/contracts";
import { useConsoleIdentity } from "./app-navigation";
import { BillingForm } from "./billing-form";
import { ConsoleError, consoleApi, useConsoleResource } from "./console-api";
import { DateValue, Loading, PageHeading, RequestError } from "./console-ui";
import { connectWallet, signWalletMessage } from "./wallet";

export function Settings() {
  const resource = useConsoleResource<{ profile: SenderProfile }>("/api/profile");
  return (
    <>
      <PageHeading title="Settings">
        Your sender identity and invoice defaults. Payout changes require a separate signature.
      </PageHeading>
      {resource.loading && <Loading label="Loading sender details..." />}
      <RequestError error={resource.error} retry={resource.retry} />
      {resource.data && (
        <>
          <section className="ledger-section">
            <BillingForm
              kind="sender"
              initial={resource.data.profile}
              onSaved={(profile) => resource.update({ profile })}
            />
          </section>
          <PayoutChange profile={resource.data.profile} onSaved={(profile) => resource.update({ profile })} />
        </>
      )}
    </>
  );
}

export function PayoutChange({
  profile,
  onSaved,
}: {
  profile: SenderProfile;
  onSaved: (profile: SenderProfile) => void;
}) {
  const session = useConsoleIdentity();
  const [newWallet, setNewWallet] = useState("");
  const [review, setReview] = useState<{ nonce: NonceResponse; from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");
  async function prepare(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus("");
    setReview(null);
    try {
      const parsed = walletSchema.safeParse(newWallet.trim());
      if (!parsed.success || parsed.data === profile.payoutWallet.toLowerCase())
        throw new ConsoleError("VALIDATION_ERROR", 400);
      // Refresh the snapshot before asking the server to bind its revision and exact old/new values.
      const { profile: current } = await consoleApi<{ profile: SenderProfile }>("/api/profile");
      onSaved(current);
      const nonce = await consoleApi<NonceResponse>("/api/auth/nonce", {
        purpose: "payr-payout-change-v1",
        newPayoutWallet: parsed.data,
        expectedRevision: current.revision,
      });
      setReview({ nonce, from: current.payoutWallet, to: parsed.data });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (!review) return;
    setBusy(true);
    setError(null);
    setStatus("Open the owner wallet and review the exact payout-change message.");
    try {
      const connection = await connectWallet(session.ownerWallet);
      const signature = await signWalletMessage(connection, review.nonce.message);
      setStatus("Verifying the owner signature...");
      const result = await consoleApi<{ profile: SenderProfile }>("/api/auth/verify", {
        nonceId: review.nonce.nonceId,
        signature,
      });
      onSaved(result.profile);
      setNewWallet("");
      setStatus("Payout wallet updated. Sender form edits have not been changed.");
    } catch (failure) {
      setError(failure);
      setStatus("");
    } finally {
      setReview(null);
      setBusy(false);
    }
  }
  return (
    <section className="ledger-section payout-section">
      <div className="section-heading">
        <h2>Payout wallet</h2>
        <span>Owner signature required</span>
      </div>
      <dl className="record-details">
        <dt>Workspace owner</dt>
        <dd>
          <code className="wallet-address">{session.ownerWallet}</code>
        </dd>
        <dt>Current payout wallet</dt>
        <dd>
          <code className="wallet-address">{profile.payoutWallet}</code>
        </dd>
      </dl>
      <p>
        The owner wallet authorizes this change, even when it is different from either payout wallet. Saving
        sender details never changes your payout address.
      </p>
      <form onSubmit={prepare}>
        <label className="field" htmlFor="new-payout-wallet">
          <span>New payout wallet</span>
          <input
            id="new-payout-wallet"
            className="technical"
            value={newWallet}
            onChange={(event) => {
              setNewWallet(event.target.value);
              setReview(null);
              setStatus("");
            }}
            placeholder="0x..."
            required
            pattern="0x[0-9a-fA-F]{40}"
            maxLength={42}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <button
          className="button secondary"
          disabled={busy || !!review || newWallet.trim().toLowerCase() === profile.payoutWallet.toLowerCase()}
        >
          {busy ? "Preparing request..." : "Review payout change"}
        </button>
      </form>
      {review && (
        <div className="notice payout-review">
          <h3>Confirm the exact change</h3>
          <dl className="record-details">
            <dt>Old payout wallet</dt>
            <dd>
              <code className="wallet-address">{review.from}</code>
            </dd>
            <dt>New payout wallet</dt>
            <dd>
              <code className="wallet-address">{review.to}</code>
            </dd>
            <dt>Request expires</dt>
            <dd>
              <DateValue value={review.nonce.expiresAt} />
            </dd>
          </dl>
          <details>
            <summary>Read the exact signing message</summary>
            <pre className="signing-message">{review.nonce.message}</pre>
          </details>
          <div className="actions">
            <button className="button" disabled={busy} onClick={sign}>
              {busy ? "Waiting for owner signature..." : "Sign payout change"}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setReview(null)}>
              Cancel change
            </button>
          </div>
        </div>
      )}
      <RequestError error={error} />
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
