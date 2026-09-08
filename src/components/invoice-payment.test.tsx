import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { paymentSetup as setup, unpaidStatus as unpaid, paidStatus } from "../lib/payments/payment.test-support";
import { InvoicePayment } from "./invoice-payment";

const mocks = vi.hoisted(() => ({ connected: false, chainId: 5042002, connect: vi.fn(), pay: vi.fn(), disconnect: vi.fn(), qr: vi.fn(), watch: vi.fn(), switchChain: vi.fn(),
  wcMessage: undefined as undefined | ((message: { type: string; data?: unknown }) => Promise<void>) }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: mocks.connected ? `0x${"5".repeat(40)}` : undefined, chainId: mocks.chainId, isConnected: mocks.connected }),
  useConfig: () => ({}), useConnect: () => ({ connectors: [{ id: "injected", name: "Browser wallet", emitter: { on: vi.fn(), off: vi.fn() } },
    { id: "walletConnect", emitter: { on: (_name: string, fn: typeof mocks.wcMessage) => { mocks.wcMessage = fn; }, off: vi.fn() } }], connectAsync: mocks.connect }),
  useDisconnect: () => ({ disconnectAsync: mocks.disconnect }), useSwitchChain: () => ({ switchChainAsync: mocks.switchChain }) }));
vi.mock("next/dynamic", () => ({ default: () => ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../lib/payments/browser-payment", () => ({ createBrowserPaymentAdapter: () => ({}), watchPaymentReplacement: mocks.watch }));
vi.mock("../lib/payments/pay", () => ({ payInvoice: mocks.pay }));
vi.mock("qrcode", () => ({ toDataURL: mocks.qr }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  mocks.connected = false; mocks.chainId = 5042002; mocks.pay.mockReset(); mocks.connect.mockReset(); mocks.switchChain.mockReset();
  mocks.qr.mockReset().mockResolvedValue("data:image/png;base64,test");
  mocks.watch.mockReset().mockResolvedValue(undefined);
  mocks.disconnect.mockReset().mockImplementation(async () => { mocks.connected = false; });
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(unpaid)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const mount = () => render(<InvoicePayment setup={setup} invoiceUrl="https://example.test/invoice/test-only" initialStatus={unpaid} />);

it("renders and connects without requesting authorization or payment", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Connect browser wallet" }));
  await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
  expect(mocks.pay).not.toHaveBeenCalled();
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
});

it("offers switching on the wrong network and keeps Pay disabled after switch rejection", async () => {
  mocks.connected = true; mocks.chainId = 1; mocks.switchChain.mockRejectedValue(new Error("rejected")); mount();
  fireEvent.click(screen.getByRole("button", { name: "Switch to Arc Testnet" }));
  await screen.findByText(/Network switch was not completed/);
  expect(screen.getByRole("button", { name: /Pay Invoice/ }).hasAttribute("disabled")).toBe(true);
  expect(mocks.pay).not.toHaveBeenCalled();
});

it("prevents double clicks and never derives Paid from a submitted hash", async () => {
  mocks.connected = true;
  let finish!: (hash: string) => void;
  mocks.pay.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mount(); const button = screen.getByRole("button", { name: /Pay Invoice/ });
  fireEvent.click(button); fireEvent.click(button); expect(mocks.pay).toHaveBeenCalledOnce();
  finish(`0x${"6".repeat(64)}`);
  await screen.findByText(/Transaction submitted/);
  expect(screen.queryByText("Paid")).toBeNull();
  expect(sessionStorage.getItem(`payr:payment:${setup.invoiceKey}`)).toBe(`0x${"6".repeat(64)}`);
});

it("shows settled-after-void Paid from matching status, separately from pending receipt and email", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...paidStatus, commercialState: "voided", settledAfterVoid: true })));
  mount(); await screen.findByText("Paid");
  expect(screen.getByText(/settled after the invoice was voided/)).toBeTruthy();
  expect(screen.getByText("Receipt queued.")).toBeTruthy();
  expect(screen.getByText("Email status: queued")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Pay Invoice/ })).toBeNull();
  expect(mocks.pay).not.toHaveBeenCalled();
});

it("continues polling receipt and delivery after persisted settlement and stops at provider acceptance", async () => {
  vi.useFakeTimers();
  const ready = { ...paidStatus, receipt: { state: "ready", pageUrl: "https://example.test/receipt/test", pdfUrl: "https://example.test/receipt/test/pdf", pdfFilename: "receipt.pdf", pdfContentHash: `0x${"8".repeat(64)}` }, receiptEmailState: "sent" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(paidStatus)).mockImplementation(async () => Response.json(ready)));
  mount(); await act(async () => {});
  expect(screen.getByText("Paid")).toBeTruthy(); expect(screen.getByText("Receipt queued.")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(screen.getByRole("link", { name: "View receipt" }).getAttribute("href")).toBe("https://example.test/receipt/test");
  expect(screen.getByText(/Accepted by email provider, not confirmation/)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps an observed settlement after manual retry receives stale unpaid status", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(paidStatus))
    .mockImplementation(async () => Response.json(unpaid)));
  mount(); await screen.findByText("Paid");
  fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Paid")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Pay Invoice/ })).toBeNull();
  expect(mocks.pay).not.toHaveBeenCalled();
});

it("reads persisted settlement even when immediate reconciliation is unavailable", async () => {
  sessionStorage.setItem(`payr:payment:${setup.invoiceKey}`, `0x${"6".repeat(64)}`);
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (String(url).includes("/reconcile/")) throw new Error("network unavailable");
    return Response.json(paidStatus);
  }));
  mount(); await screen.findByText("Paid");
  expect(screen.getByText("Receipt queued.")).toBeTruthy();
  expect(mocks.pay).not.toHaveBeenCalled();
});

it("shows committed payment awaiting sync while reconciliation remains pending, never Paid", async () => {
  sessionStorage.setItem(`payr:payment:${setup.invoiceKey}`, `0x${"6".repeat(64)}`);
  mocks.watch.mockImplementation(async (_setup, _hash, _signal, _replace, confirmed) => { confirmed(); });
  vi.stubGlobal("fetch", vi.fn(async (url) => Response.json(String(url).includes("/reconcile/") ? { outcome: "pending" } : unpaid)));
  mount(); await screen.findByText("Payment final; syncing receipt");
  expect(screen.queryByText("Paid")).toBeNull();
  expect(screen.queryByRole("button", { name: /Pay Invoice/ })).toBeNull();
});

it.each(["pending", "verified", "reverted", "rejected"])("never infers Paid from %s before persisted settlement", async (outcome) => {
  mocks.connected = true;
  if (outcome === "rejected") {
    mocks.pay.mockRejectedValue(new Error("wallet rejected")); mount(); fireEvent.click(screen.getByRole("button", { name: /Pay Invoice/ }));
    await screen.findByRole("alert");
  } else {
    sessionStorage.setItem(`payr:payment:${setup.invoiceKey}`, `0x${"6".repeat(64)}`);
    vi.stubGlobal("fetch", vi.fn(async (url) => Response.json(String(url).includes("/reconcile/")
      ? outcome === "reverted" ? { outcome: "invalid", reason: "reverted" } : { outcome } : unpaid)));
    mount(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    if (outcome === "verified") await screen.findByText("Payment final; syncing receipt");
    if (outcome === "reverted") {
      fireEvent.click(await screen.findByRole("button", { name: "Review and retry payment" }));
      expect(sessionStorage.getItem(`payr:payment:${setup.invoiceKey}`)).toBeNull();
    } else expect(screen.queryByRole("button", { name: "Review and retry payment" })).toBeNull();
  }
  expect(screen.queryByText("Paid")).toBeNull();
});

it("bounds dropped-transaction polling and never offers an unsafe second payment", async () => {
  vi.useFakeTimers(); sessionStorage.setItem(`payr:payment:${setup.invoiceKey}`, `0x${"6".repeat(64)}`);
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(600000); });
  expect(fetch).toHaveBeenCalledTimes(24);
  expect(screen.getByText(/Automatic status checks paused/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Review and retry payment" })).toBeNull();
  expect(screen.queryByText("Paid")).toBeNull();
});

it("disconnects a late WalletConnect approval after dismissal", async () => {
  let finish!: () => void;
  mocks.connect.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  mount(); fireEvent.click(screen.getByRole("button", { name: "WalletConnect" }));
  await act(async () => { await mocks.wcMessage!({ type: "display_uri", data: "wc:test-only-pairing" }); });
  fireEvent.click(screen.getByRole("button", { name: "Cancel connection" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "WalletConnect" }).hasAttribute("disabled")).toBe(true);
  mocks.connected = true; await act(async () => { finish(); });
  expect(mocks.disconnect).toHaveBeenCalledOnce(); expect(mocks.pay).not.toHaveBeenCalled();
});

it("does not reopen a QR dialog after the connection succeeds", async () => {
  let finishConnection!: () => void, finishQr!: (image: string) => void;
  mocks.connect.mockReturnValue(new Promise<void>((resolve) => { finishConnection = resolve; }));
  mocks.qr.mockReturnValue(new Promise<string>((resolve) => { finishQr = resolve; }));
  mount(); fireEvent.click(screen.getByRole("button", { name: "WalletConnect" }));
  let renderQr!: Promise<void>;
  await act(async () => { renderQr = mocks.wcMessage!({ type: "display_uri", data: "wc:test-only-pairing" }); });
  await act(async () => { finishConnection(); });
  await act(async () => { finishQr("data:image/png;base64,test"); await renderQr; });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps Pay locked when disconnecting a dismissed late approval fails", async () => {
  let finish!: () => void;
  mocks.connect.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; })); mocks.disconnect.mockRejectedValue(new Error("offline"));
  mount(); fireEvent.click(screen.getByRole("button", { name: "WalletConnect" }));
  await act(async () => { await mocks.wcMessage!({ type: "display_uri", data: "wc:test-only-pairing" }); });
  fireEvent.click(screen.getByRole("button", { name: "Cancel connection" })); mocks.connected = true;
  await act(async () => { finish(); });
  expect(screen.getByRole("button", { name: /Pay Invoice/ }).hasAttribute("disabled")).toBe(true); expect(mocks.pay).not.toHaveBeenCalled();
});

it("restarts replacement recovery on manual retry and submits only the recovered hash", async () => {
  const replacement = `0x${"8".repeat(64)}`;
  sessionStorage.setItem(`payr:payment:${setup.invoiceKey}`, `0x${"6".repeat(64)}`);
  mocks.watch.mockRejectedValueOnce(new Error("RPC unavailable")).mockImplementationOnce(async (_setup, _hash, _signal, replace) => { replace(replacement, true); }).mockResolvedValue(undefined);
  mount(); await waitFor(() => expect(mocks.watch).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
  await waitFor(() => expect(mocks.watch).toHaveBeenCalledTimes(3));
  expect(mocks.watch.mock.calls[0][2].aborted).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.body === JSON.stringify({ transactionHash: replacement }))).toBe(true);
  expect(screen.queryByRole("button", { name: "Review and retry payment" })).toBeNull();
});
