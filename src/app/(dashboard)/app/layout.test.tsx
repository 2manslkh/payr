import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getDashboardSession } from "../../../lib/auth/runtime";
import DashboardLayout from "./layout";

vi.mock("../../../lib/auth/runtime", () => ({ getDashboardSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  usePathname: () => "/app",
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("awaits the frozen server session and redirects a missing identity", async () => {
  vi.mocked(getDashboardSession).mockResolvedValue(null);
  await expect(DashboardLayout({ children: <p>Private child</p> })).rejects.toThrow("redirect:/login");
});

it("renders static children with only workspace identity from the session", async () => {
  vi.mocked(getDashboardSession).mockResolvedValue({
    workspaceId: "workspace",
    ownerWallet: "0x1111111111111111111111111111111111111111",
  });
  render(await DashboardLayout({ children: <p>Private child</p> }));
  expect(screen.getByText("Private child")).toBeDefined();
  expect(screen.getByRole("main").id).toBe("main-content");
});
