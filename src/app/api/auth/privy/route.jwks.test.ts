// @vitest-environment node
import { createHmac } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { config } from "../../../../lib/auth/test-support";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ admitNonceIssuance: vi.fn(), database: vi.fn() }));
vi.mock("../../../../lib/auth/runtime", async (original) => ({ ...await original<object>(),
  getIdentityRuntime: () => ({ config, repository: { admitNonceIssuance: mocks.admitNonceIssuance } }),
}));
vi.mock("../../../../lib/db/admin", () => ({ createSupabaseAdminClient: mocks.database }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("throttles before real SDK verification, shares JWKS on invalid signatures, and retains verified-subject admission", async () => {
  const appId = "offline-route-app";
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", appId);
  vi.stubEnv("PRIVY_APP_SECRET", "offline-test-secret");
  vi.stubEnv("PRIVY_WALLET_POLICY_ID", "offline-policy");
  vi.stubEnv("VERCEL", "1");
  const issuer = await generateKeyPair("ES256"), attacker = await generateKeyPair("ES256");
  const fetchJwks = vi.fn<typeof fetch>(async (url) => {
    if (String(url) !== `https://api.privy.io/v1/apps/${appId}/jwks.json`) throw new Error("Unexpected offline transport request");
    return Response.json({ keys: [{ ...await exportJWK(issuer.publicKey), kid: "published-key", alg: "ES256", use: "sig" }] });
  });
  vi.stubGlobal("fetch", fetchJwks);
  const utils = vi.spyOn(PrivyClient.prototype, "utils");
  const signedToken = (key: CryptoKey, subject: string) => new SignJWT({ sid: "offline-session" })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "published-key" }).setIssuer("privy.io").setAudience(appId)
    .setSubject(subject).setIssuedAt().setExpirationTime("5m").sign(key);
  const send = (token: string) => POST(new Request(`${config.appOrigin}/api/auth/privy`, {
    method: "POST", headers: { Origin: config.appOrigin, Host: new URL(config.appOrigin).host,
      "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-vercel-forwarded-for": "192.0.2.1" },
    body: '{"action":"signin"}',
  }));
  const invalid = await signedToken(attacker.privateKey, "did:privy:unverified");
  const denied = { allowed: false, retryAfterSeconds: 23 }, allowed = { allowed: true, retryAfterSeconds: 0 };
  mocks.admitNonceIssuance.mockResolvedValue(denied);
  const throttled = await send(invalid);
  expect(throttled.status).toBe(429);
  expect(throttled.headers.get("retry-after")).toBe("23");
  expect(fetchJwks).not.toHaveBeenCalled();
  expect(utils).not.toHaveBeenCalled();

  mocks.admitNonceIssuance.mockReset().mockResolvedValue(allowed);
  for (const token of [invalid, await signedToken(attacker.privateKey, "did:privy:different-unverified")]) {
    const response = await send(token);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  }
  expect(utils).toHaveBeenCalledTimes(2);
  expect(fetchJwks).toHaveBeenCalledOnce();
  expect(mocks.admitNonceIssuance).toHaveBeenCalledTimes(2);
  expect(mocks.admitNonceIssuance.mock.calls[0]).toEqual(mocks.admitNonceIssuance.mock.calls[1]);

  // Denial still wins when changed app configuration would otherwise force a cold JWKS fetch.
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", `${appId}-rotated`);
  mocks.admitNonceIssuance.mockResolvedValue(denied);
  expect((await send(invalid)).status).toBe(429);
  expect(utils).toHaveBeenCalledTimes(2);
  expect(fetchJwks).toHaveBeenCalledOnce();
  mocks.admitNonceIssuance.mockRejectedValueOnce(new Error("offline quota failure"));
  expect((await send(invalid)).status).toBe(500);
  expect(utils).toHaveBeenCalledTimes(2);

  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", appId);
  const subject = "did:privy:genuine-subject";
  mocks.admitNonceIssuance.mockReset().mockResolvedValueOnce(allowed).mockResolvedValueOnce(denied);
  expect((await send(await signedToken(issuer.privateKey, subject))).status).toBe(429);
  expect(utils).toHaveBeenCalledTimes(3);
  expect(fetchJwks).toHaveBeenCalledOnce();
  expect(mocks.admitNonceIssuance.mock.calls[1][0].walletHash)
    .toBe(createHmac("sha256", config.connectorPepper).update(`privy:${subject}`).digest("hex"));
  expect(mocks.database).not.toHaveBeenCalled();
});
