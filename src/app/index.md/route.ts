import { discoveryLinks, homepageMarkdown } from "../../lib/discovery";

export function GET() {
  return new Response(homepageMarkdown, { headers: {
    "Content-Type": "text/markdown; charset=utf-8", Link: discoveryLinks,
  } });
}
