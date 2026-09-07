import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage, { metadata as homeMetadata } from "./page";
import { generateMetadata, viewport } from "./layout";

afterEach(() => vi.unstubAllEnvs());

describe("HomePage", () => {
  it("defines Payr search and social metadata without a site-wide homepage canonical", () => {
    const metadata = generateMetadata();
    expect(metadata.title).toBe("Payr | Invoice. Settle. Reconcile.");
    expect(metadata.description).toContain("Arc testnet");
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(metadata.openGraph).toMatchObject({ type: "website", siteName: "Payr", title: metadata.title, description: metadata.description });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: metadata.title });
    expect(homeMetadata.alternates.canonical).toBe("/");
    expect(metadata.alternates).toBeUndefined();
    expect(viewport.themeColor).toBe("#071B3B");
    expect(metadata.description).toContain("payments and receipts are in development");
  });
  it.each([undefined, "https://payr.example", "http://localhost:3125"])("uses a validated metadata origin: %s", (origin) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    expect(generateMetadata().metadataBase?.toString()).toBe(`${origin ?? "https://payrlink.xyz"}/`);
  });
  it.each(["", "not-a-url", "http://payr.example", "https://user:pass@payr.example", "https://payr.example/?secret=x"])(
    "rejects unsafe metadata configuration: %s", (origin) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
      expect(() => generateMetadata()).toThrow();
    },
  );
  it("does not parse configuration when the layout module is imported", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not-a-url");
    vi.resetModules();
    await expect(import("./layout")).resolves.toBeDefined();
  });
  it("renders the Payr product promise", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Invoice. Settle. Reconcile." })).toBeDefined();
    expect(screen.getByRole("link", { name: "Sign in to Payr" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("img", { name: "Payr" }).querySelector("img")?.getAttribute("style")).toBeNull();
    expect(screen.getByText(/Wallet payments and receipts are still in development/)).toBeDefined();
  });
});
