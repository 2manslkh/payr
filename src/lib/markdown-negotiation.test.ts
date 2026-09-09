import { expect, it } from "vitest";
import { prefersMarkdown } from "./markdown-negotiation";
import vercelConfig from "../../vercel.json";

it("preserves the homepage response transform required by Vercel negotiation", () => {
  expect(vercelConfig.routes).toContainEqual({ src: "^/$", continue: true, transforms: [
    { type: "response.headers", op: "append", target: { key: "Vary" }, args: "Accept" },
  ] });
});

it.each([
  [null, false], ["", false], ["*/*", false], ["text/*", false], ["text/html", false],
  ["text/markdown", true], ["text/markdown; charset=utf-8", true], ["TEXT/MARKDOWN", true],
  ["text/markdown;q=0", false], ["text/markdown;q=0.0,*/*;q=1", false],
  ["text/markdown;q=0.5,text/html", false], ["text/markdown,text/html;q=0.8", true],
  ["text/markdown,text/html", true], ["text/markdown;q=0.5,text/*;q=0.8", false],
  ["text/markdown;q=0.5,*/*;q=0.8", false], ["text/html;q=0,*/*;q=1,text/markdown;q=0.5", true],
  ["text/markdown;q=broken", false], ["text/markdown;q=2", false], ["text/markdown;q=-1", false],
  ["text/markdown;q=", false], ["application/markdown", false],
])("negotiates %s as Markdown: %s", (accept, expected) => {
  expect(prefersMarkdown(accept)).toBe(expected);
});
