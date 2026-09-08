import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillInstall } from "./skill-install";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SkillInstall", () => {
  it("shows the public skill command and keeps connector setup separate", () => {
    render(<SkillInstall />);
    expect(screen.getByRole("tabpanel").textContent).toBe("npx skills add 2manslkh/payr --skill payr-create-invoice");
    expect(screen.getByRole("link", { name: "Connect Payr tools separately." }).getAttribute("href")).toBe("/app/connections");
  });

  it("switches runners with clicks and keyboard navigation", () => {
    render(<SkillInstall />);
    fireEvent.click(screen.getByRole("tab", { name: "pnpm" }));
    expect(screen.getByRole("tabpanel").textContent).toMatch(/^pnpm dlx skills add/);
    fireEvent.keyDown(screen.getByRole("tab", { name: "pnpm" }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "bun" }));
    expect(screen.getByRole("tabpanel").textContent).toMatch(/^bunx skills add/);
    fireEvent.keyDown(screen.getByRole("tab", { name: "bun" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "npm" }).getAttribute("aria-selected")).toBe("true");
  });

  it("copies the selected command and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<SkillInstall />);
    fireEvent.click(screen.getByRole("tab", { name: "pnpm" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy installation command" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Installation command copied."));
    expect(writeText).toHaveBeenCalledWith("pnpm dlx skills add 2manslkh/payr --skill payr-create-invoice");
  });

  it("offers manual copying when clipboard access fails", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    render(<SkillInstall />);
    fireEvent.click(screen.getByRole("button", { name: "Copy installation command" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Select and copy the command above."));
  });
});
