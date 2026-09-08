import { apiMarkdown } from "../../../lib/discovery";

export function GET() {
  return new Response(apiMarkdown, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
