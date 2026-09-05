import { expect, it } from "vitest";
import { requireTrustedOrigin } from "./origin";

it("requires the configured origin and host, ignoring spoofed forwarded headers", () => {
  expect(() => requireTrustedOrigin(new Request("https://payrlink.xyz/api/profile", {
    headers: { origin: "https://payrlink.xyz", host: "payrlink.xyz" },
  }), "https://payrlink.xyz")).not.toThrow();
  expect(() => requireTrustedOrigin(new Request("https://payrlink.xyz/api/profile", {
    headers: { origin: "https://evil.test", host: "evil.test", "x-forwarded-host": "payrlink.xyz" },
  }), "https://payrlink.xyz")).toThrow();
});

it.each([
  {}, { host: "payrlink.xyz" }, { origin: "https://payrlink.xyz" },
  { origin: "null", host: "payrlink.xyz" }, { origin: "https://evil.test", host: "payrlink.xyz" },
  { origin: "https://payrlink.xyz/", host: "payrlink.xyz" },
  { origin: "https://payrlink.xyz", host: "evil.test", "x-forwarded-host": "payrlink.xyz" },
  { origin: "https://payrlink.xyz", host: "payrlink.xyz:443" },
  { origin: "https://payrlink.xyz", host: "PAYRLINK.XYZ" },
  { origin: "https://payrlink.xyz, https://evil.test", host: "payrlink.xyz" },
])("denies missing or non-exact Origin/Host: %j", (headers) => {
  expect(() => requireTrustedOrigin(new Request("https://payrlink.xyz/api/auth/nonce", { headers: headers as HeadersInit }), "https://payrlink.xyz"))
    .toThrow(expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED" }));
});

it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])("supports exact explicit development origin %s without trusting forwarded host", (origin) => {
  expect(() => requireTrustedOrigin(new Request(`${origin}/api/auth/nonce`, {
    headers: { origin, host: new URL(origin).host, "x-forwarded-host": "evil.test" },
  }), origin)).not.toThrow();
});
