import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

let conflicts = 0;
let traces = 0;
const pdfEntries = new Set(["app/api/v1/[operation]/route.js.nft.json", "app/api/mcp/route.js.nft.json", "app/api/mcp/[token]/route.js.nft.json", "app/api/invoices/[id]/publish/route.js.nft.json", "app/api/jobs/publications/route.js.nft.json",
  "app/api/jobs/receipts/route.js.nft.json", "app/api/jobs/outbox/route.js.nft.json", "app/api/jobs/invoice-outbox/route.js.nft.json", "app/receipt/[slug]/page.js.nft.json"]);
const required = ["/pdfjs-dist/package.json", "/pdfjs-dist/legacy/build/pdf.mjs", "/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf", "/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf",
  "/pdfjs-dist/standard_fonts/FoxitFixed.pfb", "/jsqr/package.json", "/jsqr/dist/jsQR.js", "/@napi-rs/canvas/index.js"];
for (const name of readdirSync(".next/server", { recursive: true })) {
  if (!name.endsWith(".nft.json")) continue;
  traces++;
  const trace = resolve(".next/server", name);
  const files = JSON.parse(readFileSync(trace, "utf8")).files.map((file) => resolve(dirname(trace), file));
  const entry = name.split(sep).join("/");
  if (pdfEntries.delete(entry)) {
    const normalized = files.map((file) => file.split(sep).join("/"));
    for (const suffix of required) if (!normalized.some((file) => file.endsWith(suffix))) throw new Error(`${entry}: missing PDF worker dependency ${suffix}`);
    if (!normalized.some((file) => file.includes("/@napi-rs/canvas-") && file.endsWith(".node"))) throw new Error(`${entry}: missing native canvas binary`);
  }
  for (const file of files) {
    if (!lstatSync(file).isSymbolicLink()) continue;
    if (files.some((other) => other.startsWith(`${file}${sep}`))) {
      conflicts++;
      console.error(`${name}: traced symlink and its children: ${relative(process.cwd(), file)}`);
    }
  }
}
if (!traces) throw new Error("No server function traces found; build the application first");
if (pdfEntries.size) throw new Error(`Missing PDF worker entry traces: ${[...pdfEntries].join(", ")}`);
if (conflicts) throw new Error(`${conflicts} conflicting symlink entries in server function traces`);
console.log("Server function traces contain no symlink/child conflicts and include every PDF worker dependency.");
