import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { stringToHex } from "viem";
import { WalletLogin } from "./wallet-login";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("explains a missing wallet without inventing an identity", async () => {
  render(<WalletLogin />);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("No Ethereum wallet"),
  );
});

it("signs the exact server message as hex and allows retry after denial", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const message = "Payr login\nExact server message";
  const request = vi.fn().mockResolvedValueOnce([wallet]).mockRejectedValueOnce({ code: 4001 });
  Object.defineProperty(window, "ethereum", { configurable: true, value: { request } });
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ nonceId: "nonce", message, expiresAt: "2026-09-05T12:00:00Z" })),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<WalletLogin />);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({ method: "personal_sign", params: [stringToHex(message), wallet] }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("declined"));
  expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  delete (window as Window & { ethereum?: unknown }).ethereum;
});

it("hides technical configuration errors", async () => {
  Object.defineProperty(window, "ethereum", {
    configurable: true,
    value: { request: vi.fn().mockResolvedValue(["0x1111111111111111111111111111111111111111"]) },
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "CONFIGURATION_ERROR" }, detail: "SECRET_CREDENTIAL" }), {
          status: 503,
        }),
      ),
  );
  render(<WalletLogin />);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("not configured"),
  );
  expect(screen.queryByText(/SECRET_CREDENTIAL/)).toBeNull();
  delete (window as Window & { ethereum?: unknown }).ethereum;
});
