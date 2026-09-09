import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletBalance } from "./wallet-balance";
import { ConsoleError, consoleApi } from "./console-api";

vi.mock("./console-api", async (original) => ({ ...await original<typeof import("./console-api")>(), consoleApi: vi.fn() }));
const owner = `0x${"1".repeat(40)}`;
const other = `0x${"2".repeat(40)}`;
const listeners = new Map<string, (value: unknown) => void>();
const provider = { request: vi.fn(), on: vi.fn((event, listener) => listeners.set(event, listener)), removeListener: vi.fn((event) => listeners.delete(event)) };
const balance = (address = owner, balanceAtomic = "1000000000000000001") => ({ address, chainId: 5042002, balanceAtomic, updatedAt: "2026-09-08T10:00:00Z" });
beforeEach(() => {
  vi.resetAllMocks();
  listeners.clear();
  provider.on.mockImplementation((event, listener) => listeners.set(event, listener));
  provider.removeListener.mockImplementation((event) => listeners.delete(event));
  provider.request.mockResolvedValue([owner]);
  vi.stubGlobal("ethereum", provider);
  vi.mocked(consoleApi).mockResolvedValue(balance());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("explains browser-wallet requirements without JavaScript in server HTML", () => {
  const html = renderToStaticMarkup(<WalletBalance ownerWallet={owner} />);
  expect(html).toContain("<p>Browser-wallet reads require JavaScript. No balance has been assumed.</p>");
  expect(provider.request).not.toHaveBeenCalled();
  expect(consoleApi).not.toHaveBeenCalled();
});

it("reads an already selected wallet without a permission prompt or signature", async () => {
  render(<WalletBalance ownerWallet={owner} />);
  expect((await screen.findByTestId("wallet-balance")).textContent).toBe("1.000000000000000001 USDC");
  expect(provider.request).toHaveBeenCalledExactlyOnceWith({ method: "eth_accounts" });
  expect(consoleApi).toHaveBeenCalledWith(`/api/wallet/balance?address=${owner}`, undefined, expect.any(AbortSignal));
});
it("distinguishes a genuine zero from unavailable balance and leaves a refresh action", async () => {
  vi.mocked(consoleApi).mockResolvedValueOnce(balance(owner, "0")).mockRejectedValueOnce(new Error("PRIVATE_RPC"));
  render(<WalletBalance ownerWallet={owner} />);
  expect((await screen.findByTestId("wallet-balance")).textContent).toBe("0 USDC");
  fireEvent.click(screen.getByRole("button", { name: "Refresh wallet balance" }));
  await screen.findByText("Balance unavailable");
  expect(screen.queryByTestId("wallet-balance")).toBeNull();
  expect(document.body.textContent).not.toContain("PRIVATE_RPC");
});
it("requests wallet access only on click when disconnected", async () => {
  provider.request.mockResolvedValueOnce([]).mockResolvedValueOnce([owner]);
  render(<WalletBalance ownerWallet={owner} />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect wallet" }));
  await screen.findByTestId("wallet-balance");
  expect(provider.request.mock.calls.map(([input]) => input.method)).toEqual(["eth_accounts", "eth_requestAccounts"]);
});
it("clears old balance immediately on account switch and ignores its late response", async () => {
  let resolveOld: (value: unknown) => void;
  vi.mocked(consoleApi).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(balance(other, "2000000000000000000"));
  render(<WalletBalance ownerWallet={owner} />);
  await waitFor(() => expect(consoleApi).toHaveBeenCalledOnce());
  const oldSignal = vi.mocked(consoleApi).mock.calls[0][2]!;
  act(() => listeners.get("accountsChanged")!([other]));
  expect((await screen.findByTestId("wallet-balance")).textContent).toBe("2 USDC");
  expect(screen.getByText(/differs from your workspace owner/)).toBeDefined();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld!(balance()));
  expect(screen.getByTestId("wallet-balance").textContent).toBe("2 USDC");
});
it("clears balances on disconnect and removes subscriptions on unmount", async () => {
  const { unmount } = render(<WalletBalance ownerWallet={owner} />);
  await screen.findByTestId("wallet-balance");
  act(() => listeners.get("disconnect")!(undefined));
  expect(screen.queryByTestId("wallet-balance")).toBeNull();
  expect(screen.getByRole("button", { name: "Connect wallet" })).toBeDefined();
  unmount();
  expect(provider.removeListener).toHaveBeenCalledTimes(3);
});
it("offers sign-in for an expired session and does not reflect provider errors", async () => {
  vi.mocked(consoleApi).mockRejectedValue(new ConsoleError("AUTH_REQUIRED", 401));
  render(<WalletBalance ownerWallet={owner} />);
  expect((await screen.findByRole("link", { name: "Sign in again" })).getAttribute("href")).toBe("/login");
});
it.each(["address", "chain", "amount", "numeric amount"])("rejects a mismatched %s response", async (field) => {
  vi.mocked(consoleApi).mockResolvedValue({ ...balance(), ...(field === "address" ? { address: other } : field === "chain" ? { chainId: 1 } : { balanceAtomic: field === "numeric amount" ? 1000000000000000001 : "1e18" }) });
  render(<WalletBalance ownerWallet={owner} />);
  await screen.findByText("Balance unavailable");
  expect(screen.queryByTestId("wallet-balance")).toBeNull();
});
it("shows a useful missing-wallet state without making any balance request", async () => {
  vi.stubGlobal("ethereum", undefined);
  render(<WalletBalance ownerWallet={owner} />);
  await screen.findByText("No browser wallet found");
  expect(consoleApi).not.toHaveBeenCalled();
});
