"use client";

import { useId, useState } from "react";
import {
  saveClientSchema,
  saveSenderSchema,
  type ClientProfile,
  type SenderProfile,
} from "../lib/identity/contracts";
import { ConsoleError, consoleApi } from "./console-api";
import { RequestError } from "./console-ui";

type Props =
  | { kind: "sender"; initial: SenderProfile; onSaved: (profile: SenderProfile) => void }
  | { kind: "client"; initial: ClientProfile | null; onSaved: (client: ClientProfile) => void };

export function BillingForm(props: Props) {
  const id = useId();
  const [revision, setRevision] = useState(props.initial?.revision ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<SenderProfile | ClientProfile | null>(null);
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const contact = {
      businessName: text("businessName"),
      contactName: text("contactName"),
      contactEmail: text("contactEmail"),
      billingAddress: {
        line1: text("line1"),
        line2: text("line2"),
        city: text("city"),
        region: text("region"),
        postalCode: text("postalCode"),
        countryCode: text("countryCode").toUpperCase(),
      },
    };
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (props.kind === "sender") {
        const parsed = saveSenderSchema.safeParse({
          ...contact,
          expectedRevision: revision,
          invoicePrefix: text("invoicePrefix"),
          defaultPaymentTermsDays: Number(text("defaultPaymentTermsDays")),
        });
        if (!parsed.success) throw new ConsoleError("VALIDATION_ERROR", 400);
        const { profile } = await consoleApi<{ profile: SenderProfile }>("/api/profile", parsed.data);
        setRevision(profile.revision);
        props.onSaved(profile);
      } else {
        const parsed = saveClientSchema.safeParse({
          ...contact,
          id: props.initial?.id ?? null,
          expectedRevision: revision,
          alias: text("alias"),
        });
        if (!parsed.success) throw new ConsoleError("VALIDATION_ERROR", 400);
        const { client } = await consoleApi<{ client: ClientProfile }>("/api/clients", parsed.data);
        setRevision(client.revision);
        props.onSaved(client);
      }
      setSaved(true);
    } catch (failure) {
      setError(failure);
      if (failure instanceof ConsoleError && (failure.status === 409 || failure.code === "REVISION_CONFLICT"))
        setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function reviewLatest() {
    setBusy(true);
    setError(null);
    try {
      const current =
        props.kind === "sender"
          ? (await consoleApi<{ profile: SenderProfile }>("/api/profile")).profile
          : (await consoleApi<{ clients: ClientProfile[] }>("/api/clients")).clients.find(
              (client) => client.id === props.initial?.id,
            );
      if (!current) throw new ConsoleError("NOT_FOUND", 404);
      setLatest(current);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  function field(
    name: string,
    label: string,
    value: string | number | null | undefined,
    options: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) {
    return (
      <label className="field" htmlFor={`${id}-${name}`}>
        <span>{label}</span>
        <input
          id={`${id}-${name}`}
          name={name}
          defaultValue={value ?? ""}
          required
          maxLength={200}
          {...options}
        />
      </label>
    );
  }
  return (
    <form className="billing-form" onSubmit={save} onChange={() => setSaved(false)}>
      <fieldset disabled={busy}>
        <legend>
          {props.kind === "sender"
            ? "Sender details"
            : props.initial
              ? "Client details"
              : "New client details"}
        </legend>
        <div className="form-grid">
          {props.kind === "client" &&
            field("alias", "Client alias", props.initial?.alias, { maxLength: 100 })}
          {field("businessName", "Business name", props.initial?.businessName, {
            autoComplete: "organization",
          })}
          {field("contactName", "Contact name", props.initial?.contactName, { autoComplete: "name" })}
          {field("contactEmail", "Contact email", props.initial?.contactEmail, {
            type: "email",
            maxLength: 254,
            autoComplete: "email",
          })}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Billing address</legend>
        <div className="form-grid">
          {field("line1", "Address line 1", props.initial?.billingAddress?.line1, {
            autoComplete: "address-line1",
          })}
          {field("line2", "Address line 2 (optional)", props.initial?.billingAddress?.line2, {
            required: false,
            autoComplete: "address-line2",
          })}
          {field("city", "City", props.initial?.billingAddress?.city, {
            maxLength: 100,
            autoComplete: "address-level2",
          })}
          {field("region", "State / region (optional)", props.initial?.billingAddress?.region, {
            required: false,
            maxLength: 100,
            autoComplete: "address-level1",
          })}
          {field("postalCode", "Postal code", props.initial?.billingAddress?.postalCode, {
            maxLength: 32,
            autoComplete: "postal-code",
          })}
          {field("countryCode", "Country code (2 letters)", props.initial?.billingAddress?.countryCode, {
            maxLength: 2,
            minLength: 2,
            pattern: "[A-Za-z]{2}",
            autoComplete: "country",
            placeholder: "US",
          })}
        </div>
      </fieldset>
      {props.kind === "sender" && (
        <fieldset disabled={busy}>
          <legend>Invoice defaults</legend>
          <div className="form-grid">
            {field("invoicePrefix", "Invoice prefix", props.initial.invoicePrefix, {
              maxLength: 32,
              pattern: "[A-Z0-9][A-Z0-9\\-]{0,31}",
              placeholder: "INV",
              title: "Uppercase letters, numbers, and hyphens; start with a letter or number.",
            })}
            {field(
              "defaultPaymentTermsDays",
              "Default payment terms (days)",
              props.initial.defaultPaymentTermsDays,
              { type: "number", min: 0, max: 365, step: 1 },
            )}
          </div>
          <p className="field-help">
            Terms can be 0 to 365 days. Zero means due on receipt. Prefixes use uppercase letters, numbers,
            and hyphens.
          </p>
        </fieldset>
      )}
      <RequestError error={error} />
      {conflict && (
        <section className="notice" aria-label="Revision review">
          <h3>Keep your edits, review the saved record</h3>
          <p>
            No edits have been replaced. Load the latest record to compare before choosing to save over it.
          </p>
          <button type="button" className="button secondary" disabled={busy} onClick={reviewLatest}>
            Review latest saved version
          </button>
          {latest && (
            <>
              <dl className="record-details">
                {"alias" in latest && (
                  <>
                    <dt>Saved alias</dt>
                    <dd>{latest.alias}</dd>
                  </>
                )}
                <dt>Saved business</dt>
                <dd>{latest.businessName || "Not set"}</dd>
                <dt>Saved contact</dt>
                <dd>
                  {latest.contactName || "Not set"} / {latest.contactEmail || "Not set"}
                </dd>
                <dt>Saved address</dt>
                <dd>
                  {latest.billingAddress
                    ? Object.values(latest.billingAddress).filter(Boolean).join(", ")
                    : "Not set"}
                </dd>
                {"invoicePrefix" in latest && (
                  <>
                    <dt>Saved invoice prefix</dt>
                    <dd>{latest.invoicePrefix || "Not set"}</dd>
                    <dt>Saved payment terms</dt>
                    <dd>{latest.defaultPaymentTermsDays ?? "Not set"} days</dd>
                  </>
                )}
              </dl>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setRevision(latest.revision);
                  setConflict(false);
                  setLatest(null);
                  setError(null);
                }}
              >
                Use latest revision, keep my edits
              </button>
            </>
          )}
        </section>
      )}
      <div className="form-footer">
        <button className="button" disabled={busy || conflict}>
          {busy ? "Saving..." : props.kind === "sender" ? "Save sender details" : "Save client"}
        </button>
        <span role="status" aria-live="polite">
          {saved ? "Saved to your workspace." : "All fields required unless marked optional."}
        </span>
      </div>
    </form>
  );
}
