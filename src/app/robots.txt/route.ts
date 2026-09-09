import { discoveryOrigin } from "../../lib/discovery";

export function GET() {
  const privatePaths = ["/app", "/login", "/invoice/", "/receipt/", "/api/", "/dev/"];
  const searchRules = ["Allow: /", ...privatePaths.map((path) => `Disallow: ${path}`)].join("\n");
  const body = [
    "# Crawl rules are not access controls. Private links must remain secret.",
    `User-agent: *\nContent-Signal: search=yes, ai-train=no, ai-input=no\n${searchRules}`,
    ...["OAI-SearchBot", "Claude-SearchBot"].map((agent) => `User-agent: ${agent}\n${searchRules}`),
    ...["GPTBot", "ClaudeBot", "Claude-Web", "Claude-User", "ChatGPT-User", "Google-Extended", "CCBot"].map((agent) => `User-agent: ${agent}\nDisallow: /`),
    `Sitemap: ${discoveryOrigin()}/sitemap.xml`,
  ].join("\n\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
