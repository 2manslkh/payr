import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import InstallPage from "../app/install/page";
import { InstallPrompt } from "./install-prompt";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("copies public discovery-only guidance without claiming workspace access", async () => {
  let finish!: () => void;
  const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<InstallPrompt />);
  fireEvent.click(screen.getByRole("button", { name: "Copy setup prompt" }));
  expect((screen.getByRole("button", { name: "Copying..." }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("");
  finish();
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Copying does not connect your workspace"));
  const prompt = (screen.getByRole("textbox", { name: "Payr connection prompt" }) as HTMLTextAreaElement).value;
  expect(writeText).toHaveBeenCalledWith(prompt);
  expect(prompt).toContain("https://api.payrlink.xyz/mcp");
  expect(prompt).toContain("Workspace access pending");
  expect(prompt).toContain("Never ask me to paste credentials, private keys or cookies into chat or tool arguments");
  expect(prompt).toContain("read-only get_account");
  expect(prompt).toContain("Do not register an account, create a draft, publish an invoice");
  expect(prompt).not.toMatch(/(?:pgw|pac)_[a-f\d-]{36}\.|\/api\/mcp\//i);
});

it.each([undefined, { writeText: vi.fn().mockRejectedValue(new Error("Denied")) }])(
  "selects the full prompt for manual copying when clipboard access fails", async (clipboard) => {
    vi.stubGlobal("navigator", { clipboard });
    render(<InstallPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Copy setup prompt" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("copy it manually"));
    const textarea = screen.getByRole("textbox", { name: "Payr connection prompt" }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
    expect((screen.getByRole("button", { name: "Copy setup prompt" }) as HTMLButtonElement).disabled).toBe(false);
  },
);

it("separates MCP discovery from pending workspace authentication and approved Publish & Send", () => {
  render(<InstallPage />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Connect Payr to your agent.");
  expect(screen.getByText(/Claude\/Cowork workspace setup still needs verification/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Payr Connections" }).getAttribute("href")).toBe("/app/connections");
  expect(screen.getByRole("tab", { name: "Claude / Cowork", selected: true })).toBeTruthy();
  expect(screen.getByText(/currently imported gateway catalog does not include/).textContent).toContain("get_account_context");
  expect(screen.getByText(/Review the exact draft and both email recipients/).textContent).toContain("Publish & Send");
  expect(screen.getByText(/optional plugin is archived/, { selector: "p" })).toBeTruthy();
  expect(screen.queryByText(/plugin is still being prepared|Ready to invoice|sending and payment remain separate/)).toBeNull();
});
