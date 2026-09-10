import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrivyLogin, PrivyLoginButton } from "./privy-login";

const state = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "did:privy:owner" },
  login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(async () => "private-access-token") }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => state }));
vi.mock("./privy-provider", () => ({ PayrPrivyProvider: ({ children }: { children: React.ReactNode }) => children }));
const wallet = { id: "wallet", address: `0x${"1".repeat(40)}` };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { vi.clearAllMocks(); state.authenticated = true; state.ready = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("automatically provisions after authentication without silently creating a new workspace", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ wallet, session: null })); vi.stubGlobal("fetch", fetcher);
  render(<PrivyLogin appId="app" />);
  await screen.findByText(wallet.address);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ action: "signin" });
  expect((screen.getByRole("button", { name: "Create new workspace" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Create new workspace" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ action: "create_workspace" });
});
it("shows a recoverable wallet setup failure and retries the same provisioning action", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ error: { code: "WALLET_UNAVAILABLE" } }, 503))
    .mockResolvedValueOnce(json({ wallet, session: null })); vi.stubGlobal("fetch", fetcher);
  render(<PrivyLogin appId="app" />);
  await screen.findByText(/Wallet setup could not finish/);
  fireEvent.click(screen.getByRole("button", { name: "Retry wallet setup" }));
  await screen.findByText(wallet.address);
  expect(fetcher.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([{ action: "signin" }, { action: "signin" }]);
});
it("does not call provisioning before authentication", () => {
  state.authenticated = false;
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<PrivyLogin appId="app" />);
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
  expect(state.login).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  ["/app/invoices/00000000-0000-4000-8000-000000000001", "/app/invoices/00000000-0000-4000-8000-000000000001"],
  ["/login", "/app"],
  ["//untrusted.example", "/app"],
])("returns to a valid invoice path after sign-in from %s", async (pathname, destination) => {
  const replace = vi.fn();
  vi.stubGlobal("window", new Proxy(window, {
    get: (target, key) => key === "location"
      ? { pathname, search: "?next=https://untrusted.example", replace }
      : Reflect.get(target, key, target),
  }));
  vi.stubGlobal("fetch", vi.fn(async () => json({ wallet, session: { workspaceId: "workspace" } })));
  render(<PrivyLogin appId="app" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
});

it("shares the navbar login action without provisioning twice after authentication", async () => {
  state.authenticated = false;
  const fetcher = vi.fn(async () => json({ wallet, session: null })); vi.stubGlobal("fetch", fetcher);
  const view = render(<><PrivyLoginButton /><PrivyLogin appId="app" /></>);
  screen.getAllByRole("button", { name: "Login" }).forEach((button) => fireEvent.click(button));
  expect(state.login).toHaveBeenCalledTimes(2);
  expect(fetcher).not.toHaveBeenCalled();
  state.authenticated = true;
  view.rerender(<><PrivyLoginButton /><PrivyLogin appId="app" /></>);
  await screen.findByText(wallet.address);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("offers recovery when Privy initialization is unreachable rather than leaving a silent disabled button", async () => {
  vi.useFakeTimers(); state.ready = false; state.authenticated = false;
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<PrivyLogin appId="app" />);
  expect(screen.getByRole("button", { name: "Loading secure sign-in..." })).toBeTruthy();
  await act(async () => { vi.advanceTimersByTime(15_000); });
  expect(screen.getByRole("alert").textContent).toContain("Privy could not finish loading");
  expect(screen.getByRole("button", { name: "Reload sign-in" })).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
