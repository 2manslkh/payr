"use client";

import { useState } from "react";
import type { ClientProfile } from "../lib/identity/contracts";
import { BillingForm } from "./billing-form";
import { useConsoleResource } from "./console-api";
import { Loading, PageHeading, RequestError } from "./console-ui";

export function Clients() {
  const resource = useConsoleResource<{ clients: ClientProfile[] }>("/api/clients");
  const [editing, setEditing] = useState<ClientProfile | "new" | null>(null);
  return (
    <>
      <PageHeading
        title="Clients"
        action={
          !editing && (
            <button className="button" disabled={!resource.data} onClick={() => setEditing("new")}>
              Add client
            </button>
          )
        }
      >
        Confirmed billing details for the people and businesses you work with.
      </PageHeading>
      {resource.loading && <Loading label="Loading clients..." />}
      <RequestError error={resource.error} retry={resource.retry} />
      {editing && (
        <section className="ledger-section">
          <div className="section-heading">
            <h2>{editing === "new" ? "Add a client" : `Edit ${editing.alias}`}</h2>
            <button
              className="button secondary"
              onClick={() => {
                if (window.confirm("Close this editor? Any unsaved edits will be discarded."))
                  setEditing(null);
              }}
            >
              Close editor
            </button>
          </div>
          <p className="section-copy">
            Only enter billing details confirmed by you or your client. These details will be recorded as
            user-provided information.
          </p>
          <BillingForm
            key={editing === "new" ? "new" : editing.id}
            kind="client"
            initial={editing === "new" ? null : editing}
            onSaved={(client) => {
              const clients = resource.data?.clients ?? [];
              resource.update({
                clients: clients.some((item) => item.id === client.id)
                  ? clients.map((item) => (item.id === client.id ? client : item))
                  : [...clients, client],
              });
              setEditing(client);
            }}
          />
        </section>
      )}
      {resource.data && (
        <section className="ledger-section">
          <div className="section-heading">
            <h2>Client directory</h2>
            <span>{resource.data.clients.length} saved</span>
          </div>
          {!resource.data.clients.length ? (
            <div className="empty-state">
              <h3>No clients saved yet</h3>
              <p>
                Add a client&apos;s confirmed business, contact, and billing address. Invoice drafting will
                use these records in a later release.
              </p>
            </div>
          ) : (
            <table className="ledger-table">
              <caption className="sr-only">Saved clients</caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Billing location</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {resource.data.clients.map((client) => (
                  <tr key={client.id}>
                    <td data-label="Client">
                      <strong>{client.alias}</strong>
                      <span>{client.businessName}</span>
                    </td>
                    <td data-label="Contact">
                      {client.contactName}
                      <span>{client.contactEmail}</span>
                    </td>
                    <td data-label="Billing location">
                      {client.billingAddress.city}, {client.billingAddress.countryCode}
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        disabled={!!editing}
                        aria-label={`Edit ${client.alias}`}
                        onClick={() => setEditing(client)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
