// @vitest-environment node
import { expect, it } from "vitest";
import { EncryptJWT, jwtDecrypt } from "jose";
import { createSessionCodec } from "./session";
import { config, identity, owner } from "./test-support";

it("round trips encrypted identity and rejects tampering and exact expiry", async () => {
  const codec = createSessionCodec({ appOrigin: "https://payrlink.xyz", chainId: 5042002, sessionKey: new Uint8Array(32).fill(7) });
  const now = new Date("2026-09-05T00:00:00.000Z");
  const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };
  const token = await codec.seal(identity, now);
  expect(await codec.open(token, now)).toEqual(identity);
  expect(await codec.open(`${token}x`, now)).toBeNull();
  expect(await codec.open(token, new Date(now.getTime() + 8 * 60 * 60 * 1000))).toBeNull();
});

it("uses a fresh authenticated JWE and session ID per login, bound to canonical identity and configuration", async () => {
  const codec = createSessionCodec(config);
  const now = new Date("2026-09-05T00:00:00.000Z");
  const token = await codec.seal({ ...identity, ownerWallet: owner.address }, now);
  const second = await codec.seal(identity, now);
  expect(token.split(".")).toHaveLength(5);
  expect(token).not.toContain(identity.ownerWallet);
  expect(token).not.toBe(second);
  const decoded = await jwtDecrypt(token, config.sessionKey, { currentDate: now });
  expect(decoded.protectedHeader).toEqual({ alg: "dir", enc: "A256GCM", typ: "JWT" });
  expect(decoded.payload).toMatchObject({ ...identity, iss: config.appOrigin, chainId: 5042002, iat: 1788566400, exp: 1788595200 });
  expect(decoded.payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  expect(decoded.payload.jti).not.toBe((await jwtDecrypt(second, config.sessionKey, { currentDate: now })).payload.jti);
  expect(await codec.open(token, new Date("2026-09-05T07:59:59.999Z"))).toEqual(identity);
  for (const patch of [{ appOrigin: "https://other.test" }, { chainId: 1 }, { sessionKey: new Uint8Array(32).fill(9) }]) {
    expect(await createSessionCodec({ ...config, ...patch }).open(token, now)).toBeNull();
  }
  expect(await codec.open(token, new Date("invalid"))).toBeNull();
});

it.each([0, 16, 31, 33, 64])("rejects a %i-byte session key", (length) => {
  expect(() => createSessionCodec({ ...config, sessionKey: new Uint8Array(length) })).toThrow();
});

it.each([
  { workspaceId: "not-a-uuid" }, { ownerWallet: "not-a-wallet" }, { ownerWallet: owner.address },
  { jti: undefined }, { iat: undefined }, { exp: undefined }, { iss: undefined }, { chainId: undefined },
  { iat: 1788566401 }, { exp: 1788595201 }, { iat: 1788566400.5 }, { jti: "not-a-uuid" },
])("fails closed on invalid authenticated claims: %j", async (patch) => {
  const token = await new EncryptJWT({
    ...identity, iss: config.appOrigin, chainId: config.chainId, jti: "00000000-0000-4000-8000-000000000003",
    iat: 1788566400, exp: 1788595200, ...patch,
  }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).encrypt(config.sessionKey);
  expect(await createSessionCodec(config).open(token, new Date("2026-09-05T00:00:00.000Z"))).toBeNull();
});

it("denies tampering in every JWE segment and rejects malformed identities when sealing", async () => {
  const codec = createSessionCodec(config);
  const token = await codec.seal(identity);
  for (let index = 0; index < 5; index++) {
    const segments = token.split(".");
    segments[index] = (segments[index][0] === "A" ? "B" : "A") + segments[index].slice(1);
    expect(await codec.open(segments.join("."))).toBeNull();
  }
  await expect(codec.seal({ ...identity, workspaceId: "not-a-uuid" })).rejects.toThrow();
});
