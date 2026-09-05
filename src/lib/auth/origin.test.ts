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
