import { expect, it, vi } from "vitest";
import { createPaymentWalletConfig } from "./wagmi";
import { createPrivateHeaders } from "../documents/private-response";
const { walletConnect } = vi.hoisted(() => ({ walletConnect: vi.fn((options) => options) }));
vi.mock("wagmi", () => ({ createConfig: (options: unknown) => options, http: () => ({}) }));
vi.mock("wagmi/connectors", () => ({ injected: () => ({}), walletConnect }));

it("uses origin-only metadata and headless WalletConnect without telemetry", () => {
  createPaymentWalletConfig({ projectId: "1".repeat(32), appOrigin: "https://example.test", rpcUrl: "https://rpc.test", attestor: `0x${"2".repeat(40)}` });
  expect(walletConnect).toHaveBeenCalledWith(expect.objectContaining({ showQrModal: false, telemetryEnabled: false, logger: expect.objectContaining({ level: "silent" }),
    relayUrl: "wss://relay.walletconnect.org", metadata: expect.objectContaining({ url: "https://example.test", icons: ["https://example.test/brand/payr-mark-v2.png"] }) }));
});
it("allows only relay/verification hosts while retaining nonce CSP and no-referrer", () => {
  const headers = createPrivateHeaders(["https://rpc.test"], true), csp = headers.get("content-security-policy")!;
  expect(csp).toContain("wss://relay.walletconnect.org"); expect(csp).not.toMatch(/pulse|analytics|unsafe-inline|\*/);
  expect(csp).toMatch(/script-src 'self' 'nonce-/); expect(headers.get("referrer-policy")).toBe("no-referrer");
  expect(createPrivateHeaders().get("content-security-policy")).not.toContain("walletconnect");
});
