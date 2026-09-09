import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import InstallPage from "../app/install/page";
import { InstallPrompt, type PayrInstallation } from "./install-prompt";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const installation: PayrInstallation = { prompt: "Verified test fixture: install Payr after reviewing the proposed changes.", sourceUrl: "https://example.test/payr", supportedAgents: ["Test agent"] };
it("keeps the public installation page honestly unavailable without fake commands or credentials", () => {
  render(<InstallPage />);
  expect(screen.getByRole("heading", { name: "Install Payr in your agent." })).toBeDefined();
  expect((screen.getByRole("button", { name: "Copy installation prompt" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(document.body.textContent).toContain("The plugin is still being prepared.");
  expect(document.body.textContent).not.toMatch(/npx |npm install|\/api\/mcp\//);
});
it("copies only the supplied public prompt when verified installation metadata is available", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<InstallPrompt installation={installation} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy installation prompt" }));
  await screen.findByRole("button", { name: "Prompt copied" });
  expect(writeText).toHaveBeenCalledExactlyOnceWith(installation.prompt);
  expect(screen.getByRole("status").textContent).toContain("Installation prompt copied");
});
it("selects the prompt for manual copying if clipboard access fails", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("Denied"));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<InstallPrompt installation={installation} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy installation prompt" }));
  await screen.findByText(/Clipboard access was blocked/);
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionEnd).toBe(installation.prompt.length);
});
