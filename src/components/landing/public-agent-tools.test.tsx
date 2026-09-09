import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PublicAgentTools } from "./public-agent-tools";

type Tool = { name: string; annotations: { readOnlyHint: boolean }; inputSchema: { additionalProperties: boolean }; execute(input?: unknown, options?: { signal: AbortSignal }): Promise<unknown> };
const setupInstructions = "Public wallet-assisted setup. Never expose credentials.";
const capabilities = "Arc Testnet. Invoice tools require explicit approval.";
const originalDocument = Object.getOwnPropertyDescriptor(document, "modelContext");
const originalNavigator = Object.getOwnPropertyDescriptor(navigator, "modelContext");
afterEach(() => {
  cleanup();
  if (originalDocument) Object.defineProperty(document, "modelContext", originalDocument);
  else Reflect.deleteProperty(document, "modelContext");
  if (originalNavigator) Object.defineProperty(navigator, "modelContext", originalNavigator);
  else Reflect.deleteProperty(navigator, "modelContext");
});

it.each(["document", "navigator"])("registers useful read-only tools through %s and cleans up", async (owner) => {
  const tools = new Map<string, Tool>();
  const unregisterTool = vi.fn((name: string) => tools.delete(name));
  const registerTool = vi.fn((tool: Tool, options?: { signal: AbortSignal }) => {
    tools.set(tool.name, tool);
    options?.signal.addEventListener("abort", () => tools.delete(tool.name));
  });
  Object.defineProperty(owner === "document" ? document : navigator, "modelContext", { configurable: true, value: { registerTool, unregisterTool } });
  const { unmount } = render(<StrictMode><PublicAgentTools {...{ setupInstructions, capabilities }} /></StrictMode>);
  expect([...tools.keys()]).toEqual(["get_payr_setup_instructions", "get_payr_capabilities"]);
  const setup = tools.get("get_payr_setup_instructions")!;
  expect(await setup.execute()).toEqual({ content: [{ type: "text", text: setupInstructions }] });
  expect(await tools.get("get_payr_capabilities")!.execute({})).toEqual({ content: [{ type: "text", text: capabilities }] });
  expect(setup.annotations.readOnlyHint).toBe(true);
  expect(setup.inputSchema.additionalProperties).toBe(false);
  for (const input of [{ token: "do-not-accept" }, [], null, "hello"]) await expect(setup.execute(input)).rejects.toThrow("accepts no parameters");
  const controller = new AbortController(); controller.abort();
  await expect(setup.execute({}, { signal: controller.signal })).rejects.toThrow();
  unmount();
  expect(tools.size).toBe(0);
  await expect(setup.execute()).rejects.toThrow();
  expect(unregisterTool).toHaveBeenCalledTimes(owner === "navigator" ? 4 : 0);
});

it("prefers the current API without registering twice when both exist", () => {
  const current = vi.fn(), preview = vi.fn();
  Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool: current } });
  Object.defineProperty(navigator, "modelContext", { configurable: true, value: { registerTool: preview } });
  render(<PublicAgentTools {...{ setupInstructions, capabilities }} />);
  expect(current).toHaveBeenCalledTimes(2);
  expect(preview).not.toHaveBeenCalled();
});

it("leaves unsupported browsers and rejected registrations usable", async () => {
  expect(render(<PublicAgentTools {...{ setupInstructions, capabilities }} />).container.innerHTML).toBe("");
  cleanup();
  const registerTool = vi.fn().mockImplementationOnce(() => { throw new Error("Preview unavailable"); }).mockRejectedValue(new Error("Registration denied"));
  Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool } });
  expect(() => render(<PublicAgentTools {...{ setupInstructions, capabilities }} />)).not.toThrow();
  await Promise.resolve();
});
