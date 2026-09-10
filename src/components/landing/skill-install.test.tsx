import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillInstall } from "./skill-install";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mcpUrl = "https://api.payrlink.xyz/mcp";
const config = JSON.stringify({ mcpServers: { payr: { url: mcpUrl } } }, null, 2);
const snippets = [
  ["Claude / Cowork", mcpUrl],
  ["Claude Code", `claude mcp add --transport http payr ${mcpUrl}`],
  ["Cursor", config],
  ["ChatGPT / Codex", `codex mcp add payr --url ${mcpUrl}`],
  ["Custom MCP", config],
  ["CLI", "baz curl https://api.payrlink.xyz --account wallet --json"],
];

describe("SkillInstall", () => {
  it("defaults to Claude/Cowork server setup without claiming workspace authentication", () => {
    render(<SkillInstall />);
    expect(screen.getByRole("region", { name: "Connect Payr" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tab", { name: "Claude / Cowork", selected: true })).toBeTruthy();
    expect(screen.getByRole("tabpanel").querySelector("code")?.textContent).toBe(snippets[0][1]);
    expect(screen.getByRole("link", { name: "Bazantic" }).getAttribute("href")).toBe("https://bazantic.com");
    expect(screen.queryByText(/skills add|Connect Payr tools separately/)).toBeNull();
    expect(screen.getByText(/Workspace authentication is a separate step/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Workspace setup and connection guide" }).getAttribute("href")).toBe("/install");
  });

  it.each(snippets)("shows and copies the exact %s snippet", async (name, snippet) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<SkillInstall />);
    fireEvent.click(screen.getByRole("tab", { name }));
    const panel = screen.getByRole("tabpanel", { name });
    expect(panel.querySelector("code")?.textContent).toBe(snippet);
    fireEvent.click(screen.getByRole("button", { name: "Copy setup snippet" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Setup snippet copied."));
    expect(writeText).toHaveBeenCalledWith(snippet);
    fireEvent.click(screen.getByRole("tab", { name: "Claude / Cowork" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("supports arrow keys, wrapping, Home and End with roving focus", () => {
    render(<SkillInstall />);
    for (const [from, key, to] of [
      ["Claude / Cowork", "ArrowLeft", "CLI"],
      ["CLI", "ArrowRight", "Claude / Cowork"],
      ["Claude / Cowork", "ArrowRight", "Claude Code"],
      ["Claude Code", "ArrowRight", "Cursor"],
      ["Cursor", "End", "CLI"],
      ["CLI", "Home", "Claude / Cowork"],
    ]) {
      fireEvent.keyDown(screen.getByRole("tab", { name: from }), { key });
      const active = screen.getByRole("tab", { name: to, selected: true });
      expect(document.activeElement).toBe(active);
      expect(active.tabIndex).toBe(0);
      expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
      expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(active.id);
    }
  });

  it("distinguishes Codex CLI from ChatGPT connector setup", () => {
    render(<SkillInstall />);
    fireEvent.click(screen.getByRole("tab", { name: "ChatGPT / Codex" }));
    expect(screen.getByText(/Run this command in Codex CLI\. For ChatGPT/).textContent).toContain(mcpUrl);
  });

  it("keeps the selected snippet stable while copying", async () => {
    let finishCopy!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<SkillInstall />);
    fireEvent.click(screen.getByRole("button", { name: "Copy setup snippet" }));
    expect(screen.getAllByRole("tab").every((tab) => (tab as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: "Copy setup snippet" }) as HTMLButtonElement).disabled).toBe(true);
    finishCopy();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Setup snippet copied."));
    expect(screen.getAllByRole("tab").every((tab) => !(tab as HTMLButtonElement).disabled)).toBe(true);
  });

  it.each([undefined, { writeText: vi.fn().mockRejectedValue(new Error("Denied")) }])(
    "offers manual copying when clipboard access is unavailable or denied",
    async (clipboard) => {
      vi.stubGlobal("navigator", { clipboard });
      render(<SkillInstall />);
      fireEvent.click(screen.getByRole("button", { name: "Copy setup snippet" }));
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Select and copy the snippet above."));
    },
  );
});
