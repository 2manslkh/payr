export function parseJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  // JSON.parse validates syntax; this iterative scan rejects decoded duplicate names
  // at every depth without mistaking punctuation inside strings for structure.
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") stack.push(new Set());
    else if (char === "[") stack.push(null);
    else if (char === "}" || char === "]") stack.pop();
    else if (char === '"') {
      const start = i++;
      while (text[i] !== '"') {
        if (text[i] === "\\") i++;
        i++;
      }
      let next = i + 1;
      while (/[\t\r\n ]/.test(text[next] ?? "")) next++;
      if (text[next] === ":") {
        const key: string = JSON.parse(text.slice(start, i + 1));
        const keys = stack[stack.length - 1]!;
        if (keys.has(key)) throw new SyntaxError("Duplicate JSON property");
        keys.add(key);
      }
    }
  }
  return value;
}
