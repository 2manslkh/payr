"use client";

import { useEffect } from "react";

type PublicTool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, never>; additionalProperties: false };
  annotations: { readOnlyHint: true };
  execute(input?: unknown, options?: { signal?: AbortSignal }): Promise<{ content: { type: "text"; text: string }[] }>;
};
type ModelContext = {
  registerTool(tool: PublicTool, options?: { signal: AbortSignal }): void | Promise<void>;
  unregisterTool?(name: string): void;
};

export function PublicAgentTools({ setupInstructions, capabilities }: { setupInstructions: string; capabilities: string }) {
  useEffect(() => {
    const current = (document as Document & { modelContext?: ModelContext }).modelContext;
    const preview = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    const context = typeof current?.registerTool === "function" ? current : preview;
    if (!context || typeof context.registerTool !== "function") return;
    const controller = new AbortController();
    const registered: string[] = [];
    for (const [name, description, text] of [
      ["get_payr_setup_instructions", "Read Payr's public, human-assisted connector setup and credential safety instructions. Does not register a user or access a wallet.", setupInstructions],
      ["get_payr_capabilities", "Read Payr's public API/MCP capabilities, Arc Testnet limitations, and approval boundaries. Does not access workspace data.", capabilities],
    ]) {
      const tool: PublicTool = {
        name, description, inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
        async execute(input = {}, options) {
          controller.signal.throwIfAborted();
          options?.signal?.throwIfAborted();
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("This tool accepts no parameters.");
          return { content: [{ type: "text", text }] };
        },
      };
      try {
        // Current draft uses Document + AbortSignal; Chrome previews use Navigator + unregisterTool.
        const result = context === current ? context.registerTool(tool, { signal: controller.signal }) : context.registerTool(tool);
        registered.push(name);
        void Promise.resolve(result).catch(() => { /* Optional browser API: never interrupt the page. */ });
      } catch { /* Unsupported previews must leave the normal site usable. */ }
    }
    return () => {
      controller.abort();
      if (context !== current) for (const name of registered) {
        try { context.unregisterTool?.(name); } catch { /* The document may already be unloading. */ }
      }
    };
  }, [setupInstructions, capabilities]);
  return null;
}
