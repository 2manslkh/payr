"use client";

import { useEffect, useState } from "react";
import { CONNECTOR_SCOPES, type ConnectorMetadata } from "../lib/identity/contracts";
import { consoleApi, useConsoleResource } from "./console-api";
import { DateValue, Loading, PageHeading, RequestError } from "./console-ui";

type CreatedConnector = { connector: ConnectorMetadata; token: string; endpointUrl: string };

export function Connections() {
  const resource = useConsoleResource<{ connectors: ConnectorMetadata[] }>("/api/connectors");
  const [secret, setSecret] = useState<CreatedConnector | null>(null);
  const [days, setDays] = useState("7");
  const [senderSetup, setSenderSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const forget = () => setSecret(null);
    window.addEventListener("pagehide", forget);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", forget);
    };
  }, []);
  async function create(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 30) return;
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      const created = await consoleApi<CreatedConnector>("/api/connectors", { expiresInDays: Number(days),
        ...(senderSetup ? { scopes: [...CONNECTOR_SCOPES, "sender:read", "sender:write"] } : {}),
      });
      setSecret(created);
      resource.update({ connectors: [created.connector, ...(resource.data?.connectors ?? [])] });
      setStatus("Credential created. Copy it now, then acknowledge to hide it.");
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, name: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${name} copied. Clipboard history may retain it.`);
    } catch {
      setStatus(
        "Clipboard access was blocked. Select and copy the value manually, then acknowledge to hide it.",
      );
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      const { connector } = await consoleApi<{ connector: ConnectorMetadata }>(
        `/api/connectors/${encodeURIComponent(id)}/revoke`,
        {},
      );
      resource.update({
        connectors: (resource.data?.connectors ?? []).map((item) => (item.id === id ? connector : item)),
      });
      if (secret?.connector.id === id) setSecret(null);
      setRevokeId(null);
      setStatus("Connection revoked. Copies of the credential no longer grant access.");
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Connections">
        Control which credentials can access invoice tools and optional sender setup.
      </PageHeading>
      <section className="notice">
        <h2>Connect Claude to Payr</h2>
        <p>
          Add the show-once endpoint URL as a custom connector in Claude. Creating a credential does not
          connect Claude automatically. Invoice publication still requires your explicit approval.
        </p>
      </section>
      <section className="ledger-section">
        <div className="section-heading">
          <h2>Create a connection credential</h2>
          <span>Expires in 1 to 30 days</span>
        </div>
        <div className="section-body">
          <p>
            New credentials include these invoice scopes by default. Sender setup is optional below.
            No connector can change your payout wallet or manage other connections.
          </p>
          <ul className="scope-list">
            {CONNECTOR_SCOPES.map((scope) => (
              <li key={scope}>
                <code>{scope}</code>
              </li>
            ))}
          </ul>
          <div className="retention-warning" id="retention-warning">
            <h3>Know where a secret can remain</h3>
            <p>
              The endpoint URL contains the credential. Platform access logs, CDN logs, browser history,
              clipboard history, and Claude connector configuration may retain it. Payr can redact only its
              own application logs and analytics.
            </p>
            <p>
              Use a short expiry. Revoke the credential immediately after your demo, or if it may have been
              exposed. Do not share it in screenshots or support messages.
            </p>
          </div>
          <form onSubmit={create} aria-describedby="retention-warning">
            <label className="check-field" htmlFor="connection-sender-setup">
              <input id="connection-sender-setup" type="checkbox" checked={senderSetup}
                onChange={(event) => setSenderSetup(event.target.checked)} disabled={busy || !!secret}
                aria-describedby="sender-setup-help" />
              <span>Direct Chat Setup</span>
            </label>
            <p className="field-help" id="sender-setup-help">
              Optional: grants sender:read and sender:write to read, set up, and later update your business,
              contact, billing address, invoice prefix, and default terms after explicit approval in chat.
              No payout authority: payout changes always require an owner-signed action in Settings.
              Existing credentials are unchanged; create a new one to opt in.
            </p>
            <div className="inline-form">
              <label className="field" htmlFor="connection-days">
                <span>Expires in (days)</span>
                <input
                  id="connection-days"
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  required
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  disabled={busy || !!secret}
                />
              </label>
              <button className="button" disabled={busy || resource.loading || !!secret || !resource.data}>
                {busy ? "Working..." : "Create credential"}
              </button>
            </div>
          </form>
          <p className="field-help">
            Shown once on this page, held only in memory. Leaving or reloading clears it. If a creation
            response is lost, refresh the list and revoke the unrecorded credential before creating another.
          </p>
        </div>
      </section>
      {secret && (
        <section className="ledger-section secret-section" aria-label="Show-once credential">
          <div className="section-heading">
            <h2>Copy now. It will not be shown again.</h2>
          </div>
          <div className="section-body">
            <label className="field" htmlFor="connector-token">
              <span>Credential</span>
              <textarea
                id="connector-token"
                className="technical"
                readOnly
                value={secret.token}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button className="button secondary" onClick={() => copy(secret.token, "Credential")}>
              Copy credential
            </button>
            <label className="field" htmlFor="connector-endpoint">
              <span>Endpoint URL</span>
              <textarea
                id="connector-endpoint"
                className="technical"
                readOnly
                value={secret.endpointUrl}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <div className="actions">
              <button className="button secondary" onClick={() => copy(secret.endpointUrl, "Endpoint URL")}>
                Copy endpoint URL
              </button>
              <button
                className="button"
                onClick={() => {
                  setSecret(null);
                  setStatus(
                    "Credential hidden. It cannot be shown again; revoke it if you did not store it safely.",
                  );
                }}
              >
                I have saved it, hide credential
              </button>
            </div>
          </div>
        </section>
      )}
      <RequestError error={error} />
      <p role="status" aria-live="polite">
        {status}
      </p>
      {resource.loading && <Loading label="Loading connections..." />}
      <RequestError error={resource.error} retry={resource.retry} />
      {resource.data && (
        <section className="ledger-section">
          <div className="section-heading">
            <h2>Connection history</h2>
            <button className="button secondary" disabled={busy || resource.loading} onClick={resource.retry}>
              Refresh connections
            </button>
          </div>
          {resource.data.connectors.length === 0 ? (
            <div className="empty-state">
              <h3>No connection credentials</h3>
              <p>
                Create one only when you are ready to store it securely. An active credential is not proof of
                a working Claude connection.
              </p>
            </div>
          ) : (
            <ul className="connection-list">
              {resource.data.connectors.map((connector) => {
                const state = connector.revokedAt
                  ? "Revoked"
                  : now >= new Date(connector.expiresAt).getTime()
                    ? "Expired"
                    : "Active credential";
                return (
                  <li key={connector.id}>
                    <div className="connection-title">
                      <code>{connector.id}</code>
                      <span className={state === "Expired" ? "attention" : ""}>{state}</span>
                    </div>
                    <p className="field-help">Granted scopes: {connector.scopes.join(", ")}</p>
                    <dl className="connection-dates">
                      <div>
                        <dt>Created</dt>
                        <dd>
                          <DateValue value={connector.createdAt} />
                        </dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>
                          <DateValue value={connector.expiresAt} />
                        </dd>
                      </div>
                      <div>
                        <dt>Last used</dt>
                        <dd>
                          <DateValue value={connector.lastUsedAt} />
                        </dd>
                      </div>
                      {connector.revokedAt && (
                        <div>
                          <dt>Revoked</dt>
                          <dd>
                            <DateValue value={connector.revokedAt} />
                          </dd>
                        </div>
                      )}
                    </dl>
                    {!connector.revokedAt &&
                      (revokeId === connector.id ? (
                        <div className="revoke-confirm">
                          <p>
                            Revoke this credential? Any copies will stop granting access. This cannot be
                            undone.
                          </p>
                          <div className="actions">
                            <button
                              className="button danger"
                              disabled={busy || resource.loading}
                              onClick={() => revoke(connector.id)}
                            >
                              Confirm revoke
                            </button>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() => setRevokeId(null)}
                            >
                              Keep credential
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="button secondary danger-text"
                          disabled={busy || resource.loading}
                          onClick={() => setRevokeId(connector.id)}
                        >
                          Revoke credential
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
