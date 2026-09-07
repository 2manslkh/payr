import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

let conflicts = 0;
let traces = 0;
for (const name of readdirSync(".next/server", { recursive: true })) {
  if (!name.endsWith(".nft.json")) continue;
  traces++;
  const trace = resolve(".next/server", name);
  const files = JSON.parse(readFileSync(trace, "utf8")).files.map((file) => resolve(dirname(trace), file));
  for (const file of files) {
    if (!lstatSync(file).isSymbolicLink()) continue;
    if (files.some((other) => other.startsWith(`${file}${sep}`))) {
      conflicts++;
      console.error(`${name}: traced symlink and its children: ${relative(process.cwd(), file)}`);
    }
  }
}
if (!traces) throw new Error("No server function traces found; build the application first");
if (conflicts) throw new Error(`${conflicts} conflicting symlink entries in server function traces`);
console.log("Server function traces contain no symlink/child conflicts.");
