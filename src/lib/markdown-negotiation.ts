export function prefersMarkdown(accept: string | null): boolean {
  // Only an explicit Markdown range opts in; wildcards keep browsers on HTML.
  const ranges = (accept ?? "").toLowerCase().split(",").map((range) => {
    const [type, ...parameters] = range.trim().split(";");
    const quality = parameters.map((part) => part.trim()).find((part) => part.startsWith("q="))?.slice(2);
    const q = quality === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality) ? Number(quality) : 0;
    return { type: type.trim(), q };
  });
  const markdown = ranges.find(({ type }) => type === "text/markdown")?.q ?? 0;
  const html = ranges.find(({ type }) => type === "text/html")?.q
    ?? ranges.find(({ type }) => type === "text/*")?.q
    ?? ranges.find(({ type }) => type === "*/*")?.q ?? 0;
  return markdown > 0 && markdown >= html;
}
