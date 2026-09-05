import { expect, it } from "vitest";
import { createSessionCodec } from "./session";

it("round trips encrypted identity and rejects tampering and exact expiry", async () => {
  const codec = createSessionCodec({ appOrigin: "https://payrlink.xyz", chainId: 5042002, sessionKey: new Uint8Array(32).fill(7) });
  const now = new Date("2026-09-05T00:00:00.000Z");
  const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };
  const token = await codec.seal(identity, now);
  expect(await codec.open(token, now)).toEqual(identity);
  expect(await codec.open(`${token}x`, now)).toBeNull();
  expect(await codec.open(token, new Date(now.getTime() + 8 * 60 * 60 * 1000))).toBeNull();
});
