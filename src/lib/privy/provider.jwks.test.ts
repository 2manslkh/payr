// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const appId = "offline-privy-app";
const subject = "did:privy:offline-user";
const issuer = await generateKeyPair("ES256");
const attacker = await generateKeyPair("ES256");
const jwk = { ...await exportJWK(issuer.publicKey), kid: "published-key", alg: "ES256", use: "sig" };
const token = (key: CryptoKey, audience = appId, kid = jwk.kid) => new SignJWT({ sid: "offline-session" })
  .setProtectedHeader({ alg: "ES256", typ: "JWT", kid }).setIssuer("privy.io").setAudience(audience)
  .setSubject(subject).setIssuedAt().setExpirationTime("5m").sign(key);
const fetchJwks = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", appId);
  vi.stubEnv("PRIVY_APP_SECRET", "offline-test-secret");
  vi.stubEnv("PRIVY_WALLET_POLICY_ID", "offline-policy");
  fetchJwks.mockReset().mockImplementation(async (url) => {
    if (!/^https:\/\/api\.privy\.io\/v1\/apps\/offline-privy-app(?:-rotated)?\/jwks\.json$/.test(String(url))) {
      throw new Error("Unexpected offline transport request");
    }
    return Response.json({ keys: [jwk] });
  });
  vi.stubGlobal("fetch", fetchJwks);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("shares the real SDK JWKS fetch across concurrent factories and rejects invalid signatures", async () => {
  const { createPrivyProvider } = await import("./provider");
  const invalid = await token(attacker.privateKey);
  await Promise.all(Array.from({ length: 3 }, async () => {
    await expect(createPrivyProvider().verifyToken(invalid)).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  }));
  expect(fetchJwks).toHaveBeenCalledOnce();
  await expect(createPrivyProvider().verifyToken(await token(attacker.privateKey, appId, "unknown-key")))
    .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await expect(createPrivyProvider().verifyToken(await token(issuer.privateKey))).resolves.toBe(subject);
  expect(fetchJwks).toHaveBeenCalledOnce();
});

it.each(["NEXT_PUBLIC_PRIVY_APP_ID", "PRIVY_APP_SECRET"])("replaces rather than accumulates cached clients on %s rotation", async (name) => {
  const { createPrivyProvider } = await import("./provider");
  const original = name === "NEXT_PUBLIC_PRIVY_APP_ID" ? appId : "offline-test-secret";
  const valid = await token(issuer.privateKey);
  await expect(createPrivyProvider().verifyToken(valid)).resolves.toBe(subject);
  vi.stubEnv(name, `${original}-rotated`);
  const rotated = createPrivyProvider();
  await expect(rotated.verifyToken(await token(issuer.privateKey, name === "NEXT_PUBLIC_PRIVY_APP_ID" ? `${appId}-rotated` : appId)))
    .resolves.toBe(subject);
  if (name === "NEXT_PUBLIC_PRIVY_APP_ID") await expect(rotated.verifyToken(valid)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(fetchJwks).toHaveBeenCalledTimes(2);
  vi.stubEnv(name, original);
  await expect(createPrivyProvider().verifyToken(valid)).resolves.toBe(subject);
  expect(fetchJwks).toHaveBeenCalledTimes(3);
});

it("fails closed and discards the cached client when configuration is removed", async () => {
  const { createPrivyProvider } = await import("./provider");
  const valid = await token(issuer.privateKey);
  await expect(createPrivyProvider().verifyToken(valid)).resolves.toBe(subject);
  vi.stubEnv("PRIVY_APP_SECRET", "");
  expect(() => createPrivyProvider()).toThrow("CONFIGURATION_ERROR");
  expect(fetchJwks).toHaveBeenCalledOnce();
  vi.stubEnv("PRIVY_APP_SECRET", "offline-test-secret");
  await expect(createPrivyProvider().verifyToken(valid)).resolves.toBe(subject);
  expect(fetchJwks).toHaveBeenCalledTimes(2);
});
