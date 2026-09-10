import { expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

it.each<[{ link?: string | string[] }, string]>([
  [{}, "/app"],
  [{ link: "1" }, "/app?link=1"],
  [{ link: "https://example.com" }, "/app"],
  [{ link: ["1", "1"] }, "/app"],
])("redirects legacy login with %j to %s", async (query, destination) => {
  await expect(LoginPage({ searchParams: Promise.resolve(query) })).rejects.toThrow(`redirect:${destination}`);
});
