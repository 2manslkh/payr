// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { admitNonceRequest } from "./issuance";
import { config, createAuthRepository, identity } from "./test-support";

afterEach(() => vi.unstubAllEnvs());

it("separates victim admission by trusted IP and authenticated purpose", async () => {
  vi.stubEnv("VERCEL", "1");
  const { repository } = createAuthRepository();
  const admit = vi.spyOn(repository, "admitNonceIssuance");
  for (const [ip, purpose] of [["192.0.2.1", "payr-login-v1"], ["192.0.2.2", "payr-login-v1"], ["192.0.2.1", "payr-payout-change-v1"]] as const) {
    await admitNonceRequest(repository, config, new Request(config.appOrigin, { headers: { "x-vercel-forwarded-for": ip } }), identity.ownerWallet, purpose);
  }
  expect(new Set(admit.mock.calls.map(([input]) => input.walletHash)).size).toBe(3);
  expect(admit.mock.calls[0][0].ipHash).toBe(admit.mock.calls[2][0].ipHash);
});

it("ignores spoofed forwarding headers outside Vercel and persists only purpose-keyed hashes", async () => {
  vi.stubEnv("VERCEL", "0");
  const { repository } = createAuthRepository();
  const admit = vi.spyOn(repository, "admitNonceIssuance");
  await admitNonceRequest(repository, config, new Request(config.appOrigin, { headers: { "x-vercel-forwarded-for": "192.0.2.1" } }), identity.ownerWallet);
  await admitNonceRequest(repository, config, new Request(config.appOrigin, { headers: { "x-vercel-forwarded-for": "192.0.2.2" } }), identity.ownerWallet);
  expect(admit.mock.calls[0]).toEqual(admit.mock.calls[1]);
  expect(admit.mock.calls[0][0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  expect(admit.mock.calls[0][0].walletHash).not.toBe(identity.ownerWallet);
});

it("normalizes trusted IPv4-mapped IPv6 and propagates quota denial", async () => {
  vi.stubEnv("VERCEL", "1");
  const { repository } = createAuthRepository();
  const admit = vi.spyOn(repository, "admitNonceIssuance");
  for (const ip of ["192.0.2.1", "::ffff:c000:201"]) {
    await admitNonceRequest(repository, config, new Request(config.appOrigin, { headers: { "x-vercel-forwarded-for": ip } }), identity.ownerWallet);
  }
  expect(admit.mock.calls[0]).toEqual(admit.mock.calls[1]);
  admit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
  await expect(admitNonceRequest(repository, config, new Request(config.appOrigin, { headers: { "x-vercel-forwarded-for": "192.0.2.1" } }), identity.ownerWallet))
    .rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 42 });
});
