import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { stringToHex } from "viem";
import type { ClientProfile, ConnectorMetadata, SenderProfile } from "../lib/identity/contracts";
import { Activity } from "./activity";
import { AppNavigation, ConsoleIdentity } from "./app-navigation";
import { BillingForm } from "./billing-form";
import { Clients } from "./clients";
import { Connections } from "./connections";
import { ConsoleError, errorMessage } from "./console-api";
import { PayoutChange } from "./settings";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/clients" }));
const owner = "0x1111111111111111111111111111111111111111";
const newWallet = "0x2222222222222222222222222222222222222222";
const identity = { workspaceId: "11111111-1111-4111-8111-111111111111", ownerWallet: owner };
const address = {
  line1: "11 Ledger Street",
  line2: "Unit 2",
  city: "London",
  region: "London",
  postalCode: "N1 1AA",
  countryCode: "GB",
};
const profile: SenderProfile = {
  id: identity.workspaceId,
  revision: 1,
  businessName: "Ledger Studio",
  billingAddress: address,
  contactName: "Alex",
  contactEmail: "alex@example.com",
  payoutWallet: owner,
  invoicePrefix: "INV",
  defaultPaymentTermsDays: 30,
};
const client: ClientProfile = {
  id: "22222222-2222-4222-8222-222222222222",
  revision: 4,
  alias: "North",
  businessName: "North Studio",
  billingAddress: address,
  contactName: "Sam",
  contactEmail: "sam@example.com",
  provenance: {},
};
const connector: ConnectorMetadata = {
  id: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-01T12:00:00Z",
  expiresAt: "2099-09-01T12:00:00Z",
  revokedAt: null,
  lastUsedAt: null,
  scopes: ["invoice:draft", "invoice:publish", "invoice:status", "invoice:void"],
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function session(children: React.ReactNode) {
  return <ConsoleIdentity session={identity}>{children}</ConsoleIdentity>;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as Window & { ethereum?: unknown }).ethereum;
});

it("saves all sender fields without payout or owner data", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ profile: { ...profile, revision: 2 } }));
  vi.stubGlobal("fetch", fetcher);
  render(<BillingForm kind="sender" initial={profile} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Edited Studio" } });
  fireEvent.click(screen.getByRole("button", { name: "Save sender details" }));
  await screen.findByText("Saved to your workspace.");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    expectedRevision: 1,
    businessName: "Edited Studio",
    contactName: "Alex",
    contactEmail: "alex@example.com",
    billingAddress: address,
    invoicePrefix: "INV",
    defaultPaymentTermsDays: 30,
  });
  expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
});

it("preserves edits after failure and explicitly reviews a newer revision before retry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ error: "REVISION_CONFLICT" }, 409))
    .mockResolvedValueOnce(
      json({ profile: { ...profile, businessName: "Someone else's change", revision: 3 } }),
    )
    .mockResolvedValueOnce(json({ profile: { ...profile, businessName: "My edit", revision: 4 } }));
  vi.stubGlobal("fetch", fetcher);
  render(<BillingForm kind="sender" initial={profile} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "My edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save sender details" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("My edit");
  expect((screen.getByRole("button", { name: "Save sender details" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review latest saved version" }));
  await screen.findByText("Someone else's change");
  fireEvent.click(screen.getByRole("button", { name: "Use latest revision, keep my edits" }));
  fireEvent.click(screen.getByRole("button", { name: "Save sender details" }));
  await screen.findByText("Saved to your workspace.");
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
    businessName: "My edit",
    expectedRevision: 3,
  });
});

it("creates a client with null CAS fields then updates with its returned identity", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ clients: [] }))
    .mockResolvedValueOnce(json({ client }))
    .mockResolvedValueOnce(json({ client: { ...client, revision: 5 } }));
  vi.stubGlobal("fetch", fetcher);
  render(<Clients />);
  await screen.findByText("No clients saved yet");
  fireEvent.click(screen.getByRole("button", { name: "Add client" }));
  for (const [label, value] of Object.entries({
    "Client alias": client.alias,
    "Business name": client.businessName,
    "Contact name": client.contactName,
    "Contact email": client.contactEmail,
    "Address line 1": address.line1,
    City: address.city,
    "Postal code": address.postalCode,
    "Country code (2 letters)": address.countryCode,
  })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Save client" }));
  await screen.findByRole("heading", { name: "Edit North" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ id: null, expectedRevision: null });
  fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Updated Sam" } });
  fireEvent.click(screen.getByRole("button", { name: "Save client" }));
  await screen.findByText("Saved to your workspace.");
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
    id: client.id,
    expectedRevision: 4,
    contactName: "Updated Sam",
  });
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).not.toHaveProperty("provenance");
});

it("binds payout review to the current server snapshot and signs only the server message", async () => {
  const message = `Payr payout change\nOld: ${owner}\nNew: ${newWallet}`;
  const signature = `0x${"12".repeat(65)}`;
  const request = vi.fn().mockResolvedValueOnce([owner]).mockResolvedValueOnce(signature);
  Object.defineProperty(window, "ethereum", { configurable: true, value: { request } });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ profile: { ...profile, revision: 7 } }))
    .mockResolvedValueOnce(json({ nonceId: "nonce", message, expiresAt: "2099-01-01T12:00:00Z" }))
    .mockResolvedValueOnce(json({ profile: { ...profile, payoutWallet: newWallet, revision: 8 } }));
  vi.stubGlobal("fetch", fetcher);
  const onSaved = vi.fn();
  render(session(<PayoutChange profile={profile} onSaved={onSaved} />));
  fireEvent.change(screen.getByLabelText("New payout wallet"), { target: { value: newWallet } });
  fireEvent.click(screen.getByRole("button", { name: "Review payout change" }));
  const review = await screen.findByRole("heading", { name: "Confirm the exact change" });
  expect(review.parentElement?.textContent).toContain(owner);
  expect(review.parentElement?.textContent).toContain(newWallet);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    purpose: "payr-payout-change-v1",
    newPayoutWallet: newWallet,
    expectedRevision: 7,
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign payout change" }));
  await screen.findByText(/Payout wallet updated/);
  expect(request).toHaveBeenCalledWith({ method: "personal_sign", params: [stringToHex(message), owner] });
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ nonceId: "nonce", signature });
  expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ payoutWallet: newWallet }));
});

it("does not ask a non-owner payout wallet to sign", async () => {
  const request = vi.fn().mockResolvedValue([newWallet]);
  Object.defineProperty(window, "ethereum", { configurable: true, value: { request } });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ profile }))
      .mockResolvedValueOnce(
        json({ nonceId: "nonce", message: "server message", expiresAt: "2099-01-01T12:00:00Z" }),
      ),
  );
  render(session(<PayoutChange profile={profile} onSaved={vi.fn()} />));
  fireEvent.change(screen.getByLabelText("New payout wallet"), { target: { value: newWallet } });
  fireEvent.click(screen.getByRole("button", { name: "Review payout change" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sign payout change" }));
  expect((await screen.findByRole("alert")).textContent).toContain("workspace owner");
  expect(request).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("New payout wallet") as HTMLInputElement).value).toBe(newWallet);
});

it("keeps connector secrets out of lists and storage, copies, acknowledges, and revokes", async () => {
  const token = `${connector.id}.${"s".repeat(43)}`;
  const endpointUrl = `https://example.com/api/mcp/${token}`;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ connectors: [] }))
    .mockResolvedValueOnce(json({ connector, token, endpointUrl }))
    .mockResolvedValueOnce(json({ connector: { ...connector, revokedAt: "2026-09-06T12:00:00Z" } }));
  vi.stubGlobal("fetch", fetcher);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const view = render(<Connections />);
  await screen.findByText("No connection credentials");
  fireEvent.change(screen.getByLabelText("Expires in (days)"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  await screen.findByLabelText("Credential");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expiresInDays: 30 });
  fireEvent.click(screen.getByRole("button", { name: "Copy endpoint URL" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(endpointUrl));
  expect(storage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "I have saved it, hide credential" }));
  expect(screen.queryByLabelText("Credential")).toBeNull();
  expect(view.container.innerHTML).not.toContain(token);
  fireEvent.click(screen.getByRole("button", { name: "Revoke credential" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
  await screen.findByText("Connection revoked. Copies of the credential no longer grant access.");
  expect(fetcher.mock.calls[2][0]).toBe(`/api/connectors/${connector.id}/revoke`);
  expect(screen.queryByRole("button", { name: "Revoke credential" })).toBeNull();
});

it("forgets an unacknowledged secret on browser pagehide", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ connectors: [] }))
      .mockResolvedValueOnce(
        json({ connector, token: "private-value", endpointUrl: "https://example.com/private-value" }),
      ),
  );
  render(<Connections />);
  await screen.findByText("No connection credentials");
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  await screen.findByLabelText("Credential");
  fireEvent(window, new Event("pagehide"));
  expect(screen.queryByLabelText("Credential")).toBeNull();
});

it("renders actual audit events while excluding unexpected payloads and unknown codes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      json({
        events: [
          {
            id: "event1",
            action: "connector.create",
            outcome: "success",
            createdAt: connector.createdAt,
            tokenId: connector.id,
            requestBody: "PRIVATE_PAYLOAD",
          },
          {
            id: "event2",
            action: "PRIVATE_CODE",
            outcome: "PRIVATE_OUTCOME",
            createdAt: connector.createdAt,
            tokenId: "PRIVATE_TOKEN",
          },
        ],
      }),
    ),
  );
  const view = render(<Activity />);
  await screen.findByText("Credential created");
  expect(screen.getByText("Completed")).toBeDefined();
  expect(screen.getByText("Workspace event")).toBeDefined();
  expect(view.container.textContent).not.toContain("PRIVATE_");
});

it("marks navigation semantically and retains the session when logout fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(json({ error: "INTERNAL_ERROR", details: "PRIVATE_CREDENTIAL" }, 500));
  vi.stubGlobal("fetch", fetcher);
  render(session(<AppNavigation />));
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  expect(within(nav).getByRole("link", { name: "Clients" }).getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Account" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect((await screen.findByRole("alert")).textContent).not.toContain("PRIVATE_CREDENTIAL");
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/logout");
  expect(screen.getByRole("button", { name: "Sign out" })).toHaveProperty("disabled", false);
  fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

it("maps expired sessions and rate limits without exposing server messages", () => {
  expect(errorMessage(new ConsoleError("PRIVATE_CREDENTIAL", 401))).toContain("session has ended");
  expect(errorMessage(new ConsoleError("RATE_LIMITED", 429))).toContain("Wait a minute");
  expect(errorMessage(new Error("PRIVATE_CREDENTIAL"))).not.toContain("PRIVATE_CREDENTIAL");
});

it("treats inherited object names as unknown activity codes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        json({
          events: [
            {
              id: "event",
              action: "constructor",
              outcome: "__proto__",
              createdAt: connector.createdAt,
              tokenId: null,
            },
          ],
        }),
      ),
  );
  render(<Activity />);
  await screen.findByText("Workspace event");
  expect(screen.getByText("Recorded")).toBeDefined();
});

it("labels expired credentials and rejects expiry outside the frozen bounds", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(json({ connectors: [{ ...connector, expiresAt: "2020-01-01T00:00:00Z" }] }));
  vi.stubGlobal("fetch", fetcher);
  render(<Connections />);
  await screen.findByText("Expired");
  fireEvent.change(screen.getByLabelText("Expires in (days)"), { target: { value: "31" } });
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("Credential")).toBeNull();
});
