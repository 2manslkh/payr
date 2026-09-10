import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PublishAndSend } from "./publish-and-send";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const props = { invoiceId: "00000000-0000-4000-8000-000000000001", version: 2, clientEmail: "client@example.test", senderEmail: "sender@example.test", enabled: true };

it("shows both reviewed recipients and requires explicit version/default/diff/delivery approval", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ invoiceId: props.invoiceId, invoiceVersion: 2, invoiceEmail: { state: "queued", deliveries: [] } }));
  vi.stubGlobal("fetch", fetch);
  render(<PublishAndSend {...props} />);
  const button = screen.getByRole("button", { name: "Publish & Send" });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(screen.getByText(props.clientEmail)).toBeTruthy(); expect(screen.getByText(props.senderEmail)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedVersion: 2, approval: true, deliveryApproval: true, idempotencyKey: expect.any(String) });
  expect(screen.getByRole("status").textContent).toContain("Do not send a duplicate");
});

it("preserves the same approved body and key after an uncertain response", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("network loss")); vi.stubGlobal("fetch", fetch);
  render(<PublishAndSend {...props} />);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry Publish & Send" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
});

it("does not offer an enabled send action when mail is disabled", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<PublishAndSend {...props} enabled={false} />);
  expect(screen.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button"));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(/Invoice email is disabled/)).toBeTruthy();
});

it("persists only an explicitly clicked request and resumes identical consent/key after remount and status refresh", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ code: "PUBLICATION_RETRYABLE" }, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const view = render(<PublishAndSend {...props} />);
  expect(sessionStorage.length).toBe(0);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(sessionStorage.length).toBe(0);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("alert");
  const original = fetch.mock.calls[0][1].body;
  const persisted = sessionStorage.getItem(`payr:publish-and-send:${props.invoiceId}:2`)!;
  expect(JSON.parse(persisted)).toEqual({ invoiceId: props.invoiceId, ...JSON.parse(original) });
  expect(persisted).not.toContain("@");
  view.unmount();
  render(<PublishAndSend {...props} recovering />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resume Publish & Send" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1][1].body).toBe(original);
});

it.each([null, "bad-json", JSON.stringify({ invoiceId: props.invoiceId, expectedVersion: 1, approval: true, deliveryApproval: true, idempotencyKey: "00000000-0000-4000-8000-000000000002" })])(
  "never fabricates consent for a recovering attempt without a matching saved request (%s)", (stored) => {
    if (stored) sessionStorage.setItem(`payr:publish-and-send:${props.invoiceId}:2`, stored);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<PublishAndSend {...props} recovering />);
    expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("no matching approved request");
    expect(fetch).not.toHaveBeenCalled();
  },
);
