import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "./env";

describe("parsePublicEnv", () => {
  it("rejects a non-HTTPS production app URL", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://payrlink.xyz" })).toThrow();
  });

  it("accepts an HTTPS app URL", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "https://payrlink.xyz" }).NEXT_PUBLIC_APP_URL).toBe(
      "https://payrlink.xyz",
    );
  });

  it("accepts a localhost app URL with an explicit port", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }).NEXT_PUBLIC_APP_URL).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects a localhost app URL without a port", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://localhost" })).toThrow();
  });
});
