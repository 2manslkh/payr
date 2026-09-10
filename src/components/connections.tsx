"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONNECTOR_SCOPES, type ConnectorMetadata } from "../lib/identity/contracts";
import { consoleApi, useConsoleResource } from "./console-api";
import { DateValue, Loading, PageHeading, RequestError } from "./console-ui";
import { useConsoleIdentity } from "./app-navigation";

type CreatedConnector = { connector: ConnectorMetadata; token: string; endpointUrl: string };

export function Connections({ gatewayOnly = false }: { gatewayOnly?: boolean }) {
  const identity = useConsoleIdentity();
  const resource = useConsoleResource<{ connectors: ConnectorMetadata[] }>("/api/connectors");
  const [secret, setSecret] = useState<CreatedConnector | null>(null);
  const [days, setDays] = useState("7");
  const [senderSetup, setSenderSetup] = useState(false);
  const [walletRead, setWalletRead] = useState(false);
  const [gateway, setGateway] = useState(gatewayOnly);
  const [serviceId, setServiceId] = useState("bazantic");
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
    if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > (gateway ? 7 : 30)) return;
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      const scopes = [...CONNECTOR_SCOPES.filter((scope) => !gateway || scope !== "invoice:void"),
        ...(senderSetup ? ["sender:read", "sender:write"] : []), ...(walletRead ? ["wallet:read"] : [])];
      const created = await consoleApi<CreatedConnector>(gateway ? "/api/connectors/gateway" : "/api/connectors", { expiresInDays: Number(days),
        ...(senderSetup || walletRead || gateway ? { scopes } : {}), ...(gateway ? { serviceId } : {}),
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
        <h2>{gatewayOnly ? "Connect your agent through the gateway" : "Connect your agent to Payr"}</h2>
        {!gateway && <ol>
          <li>Create a short-lived credential below and copy its endpoint URL.</li>
          <li>In Claude, open Customize {">"} Connectors, choose Add custom connector, and paste the full endpoint URL. Leave optional OAuth fields blank.</li>
          <li>Start a new chat and enable Payr in the Connectors menu.</li>
        </ol>}
        <p>
          {gatewayOnly ? "This deployment accepts REST gateway connections only. Sign in through Privy to issue a gateway account credential."
            : "Use a show-once MCP endpoint URL or a REST gateway account credential. Creating a credential does not connect your agent automatically."}
          {" "}Publish &amp; Send requires approval of the exact draft and email to both snapshot recipients. Invoice email must be enabled; do not send a duplicate through Gmail. Voiding requires separate approval and payment stays in the client&apos;s wallet.
        </p>
        {gateway && <p>Prefer verified private credential injection. Hackathon setup permits a model-visible demo credential only after your explicit consent: the agent passes it in the discovered <code>requestBody.accountCredential</code> field beside <code>requestBody.input</code>, without a Bearer prefix. Never supply the gateway service key, wallet private keys or cookies. Verify your workspace with read-only <code>get_account</code>; tool discovery alone does not verify access. Refresh the gateway schemas for Publish &amp; Send before activation.</p>}
        <Link className="text-link" href="/install">View the Payr connection guide</Link>
      </section>
      <section className="ledger-section">
        <div className="section-heading">
          <h2>Create a connection credential</h2>
          <span>Expires in 1 to {gateway ? "7" : "30"} days</span>
        </div>
        <div className="section-body">
          <p>
            New credentials include these invoice scopes by default. Sender setup is optional below.
            No connector can change your payout wallet or manage other connections.
          </p>
          <ul className="scope-list">
            {CONNECTOR_SCOPES.filter((scope) => !gateway || scope !== "invoice:void").map((scope) => (
              <li key={scope}>
                <code>{scope}</code>
              </li>
            ))}
          </ul>
          <div className="retention-warning" id="retention-warning">
            <h3>Know where a secret can remain</h3>
            <p>
              {gateway ? "The hackathon body fallback exposes your credential to the model, chat, tool history and Bazantic traces. Use a dedicated demo workspace with test data, minimum permissions and preferably a one-day expiry. This is not private secret injection." : "The direct MCP endpoint URL contains the credential."} Platform access logs, CDN logs, browser history,
              clipboard history, and Claude connector configuration may retain it. Payr can redact only its
              own application logs and analytics.
            </p>
            <p>
              Use a short expiry. Revoke the credential immediately after your demo, or if it may have been
              exposed. Do not share it in screenshots or support messages.
            </p>
          </div>
          <form onSubmit={create} aria-describedby="retention-warning">
            {identity.privyUserId && <>
              <label className="check-field"><input type="checkbox" checked={gateway} disabled={gatewayOnly || busy || !!secret}
                onChange={(event) => { setGateway(event.target.checked); setDays("7"); }} /><span>REST gateway connection</span></label>
              {gateway && <label className="field"><span>Registered gateway service</span>
                <input value={serviceId} onChange={(event) => setServiceId(event.target.value)} required pattern="[a-z][a-z0-9_-]{0,63}" disabled={busy || !!secret} />
              </label>}
              <p className="field-help">Gateway credentials expire within seven days and require a separately managed service key. No owner-wallet signing is delegated to the agent.</p>
            </>}
            <label className="check-field"><input type="checkbox" checked={walletRead} disabled={busy || !!secret}
              onChange={(event) => setWalletRead(event.target.checked)} /><span>Wallet address discovery</span></label>
            <p className="field-help">Grants wallet:read for business wallet and invoice payout address discovery, never signing or spending. Existing credentials are unchanged. {gateway ? "The currently imported gateway catalog lacks get_account_context. The operator must refresh the catalog and grant its service operation scope before this permission can be used." : "After connecting, use get_account_context if exposed by your direct MCP connection."}</p>
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
                  max={gateway ? "7" : "30"}
                  step="1"
                  required
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  disabled={busy || !!secret}
                />
              </label>
              <button className="button" disabled={busy || resource.loading || !!secret || !resource.data || (gatewayOnly && !identity.privyUserId)}>
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
            {secret.endpointUrl && <><label className="field" htmlFor="connector-endpoint">
              <span>Endpoint URL</span>
              <textarea
                id="connector-endpoint"
                className="technical"
                readOnly
                value={secret.endpointUrl}
                spellCheck={false}
                autoComplete="off"
              />
            </label></>}
            <div className="actions">
              {secret.endpointUrl && <button className="button secondary" onClick={() => copy(secret.endpointUrl, "Endpoint URL")}>
                Copy endpoint URL
              </button>}
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
