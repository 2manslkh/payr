"use client";

import type { AuditEvent } from "../lib/identity/contracts";
import { useConsoleResource } from "./console-api";
import { DateValue, Loading, PageHeading, RequestError } from "./console-ui";

// Unknown server codes are not rendered verbatim: this surface must remain redacted.
const actions: Record<string, string> = {
  "auth.login": "Wallet sign-in",
  "auth.logout": "Browser sign-out",
  "auth.payout_nonce": "Payout signing request",
  "profile.save": "Sender details saved",
  "profile.payout_change": "Payout wallet change",
  "client.save": "Client details saved",
  "client.create": "Client created",
  "client.update": "Client updated",
  "connector.create": "Credential created",
  "connector.revoke": "Credential revoked",
  "connector.admit": "Connector request",
  "invoice:draft": "Invoice draft request",
  "invoice:publish": "Invoice publication request",
  "invoice:status": "Invoice status request",
  "invoice:void": "Invoice void request",
};
const outcomes: Record<string, string> = {
  succeeded: "Completed",
  allowed: "Allowed",
  denied: "Denied",
  failed: "Failed",
  rate_limited: "Rate limited",
};

export function Activity() {
  const resource = useConsoleResource<{ events: AuditEvent[] }>("/api/activity");
  return (
    <>
      <PageHeading
        title="Activity"
        action={
          <button className="button secondary" disabled={resource.loading} onClick={resource.retry}>
            Refresh activity
          </button>
        }
      >
        The latest workspace events, with sensitive details left out.
      </PageHeading>
      {resource.loading && <Loading label="Loading activity..." />}
      <RequestError error={resource.error} retry={resource.retry} />
      {resource.data && (
        <section className="ledger-section">
          <div className="section-heading">
            <h2>Workspace log</h2>
            <span>Latest {Math.min(resource.data.events.length, 100)} events</span>
          </div>
          {!resource.data.events.length ? (
            <div className="empty-state">
              <h3>No recorded activity yet</h3>
              <p>
                Actual sign-in, profile, and connection events will appear here as they are recorded. No
                example events are shown.
              </p>
            </div>
          ) : (
            <table className="ledger-table activity-table">
              <caption className="sr-only">Redacted workspace events, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Recorded at</th>
                  <th scope="col">Connection ID</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.events.slice(0, 100).map((event) => (
                  <tr key={event.id}>
                    <td data-label="Event">
                      {Object.hasOwn(actions, event.action) ? actions[event.action] : "Workspace event"}
                    </td>
                    <td data-label="Outcome">
                      {Object.hasOwn(outcomes, event.outcome) ? outcomes[event.outcome] : "Recorded"}
                    </td>
                    <td data-label="Recorded at">
                      <DateValue value={event.createdAt} />
                    </td>
                    <td data-label="Connection ID">
                      {event.tokenId && /^[0-9a-f-]{36}$/i.test(event.tokenId) ? (
                        <code>{event.tokenId}</code>
                      ) : (
                        "Not applicable"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="section-copy muted">
            This log shows event type, outcome, time, and connection ID only. It does not expose request
            bodies, billing details, wallet signatures, credentials, or protected URLs.
          </p>
        </section>
      )}
    </>
  );
}
