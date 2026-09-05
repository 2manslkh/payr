import { expect, it } from "vitest";
import { buildAuthMessage } from "./message";

it("reconstructs the frozen login message from stored facts", () => {
  expect(buildAuthMessage({
    id: "00000000-0000-4000-8000-000000000001", workspaceId: null,
    wallet: `0x${"1".repeat(40)}`, purpose: "payr-login-v1", challenge: "A".repeat(43),
    domain: "payrlink.xyz", uri: "https://payrlink.xyz", chainId: 5042002,
    issuedAt: "2026-09-05T00:00:00.000Z", expiresAt: "2026-09-05T00:05:00.000Z",
    consumedAt: null, payoutFrom: null, payoutTo: null, profileRevision: null,
  })).toBe(`payrlink.xyz wants you to sign in to Payr with your Ethereum account:\n0x${"1".repeat(40)}\n\nURI: https://payrlink.xyz\nVersion: 1\nChain ID: 5042002\nNonce: ${"A".repeat(43)}\nIssued At: 2026-09-05T00:00:00.000Z\nExpiration Time: 2026-09-05T00:05:00.000Z\nRequest ID: 00000000-0000-4000-8000-000000000001\nPurpose: payr-login-v1`);
});

it("reconstructs the exact payout layout with checksummed addresses and ISO dates", () => {
  expect(buildAuthMessage({
    id: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002",
    wallet: "0x52908400098527886e0f7030069857d2e4169ee7", purpose: "payr-payout-change-v1", challenge: "A".repeat(43),
    domain: "payrlink.xyz", uri: "https://payrlink.xyz", chainId: 5042002,
    issuedAt: "2026-09-05T00:00:00+00:00", expiresAt: "2026-09-05T00:05:00+00:00", consumedAt: null,
    payoutFrom: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed".toLowerCase(),
    payoutTo: "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359".toLowerCase(), profileRevision: 7,
  })).toBe(`payrlink.xyz wants you to authorize a Payr payout change with your Ethereum account:
0x52908400098527886E0F7030069857D2E4169EE7

URI: https://payrlink.xyz
Version: 1
Chain ID: 5042002
Nonce: ${"A".repeat(43)}
Issued At: 2026-09-05T00:00:00.000Z
Expiration Time: 2026-09-05T00:05:00.000Z
Request ID: 00000000-0000-4000-8000-000000000001
Purpose: payr-payout-change-v1
Workspace ID: 00000000-0000-4000-8000-000000000002
Current Payout: 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed
New Payout: 0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359`);
});
