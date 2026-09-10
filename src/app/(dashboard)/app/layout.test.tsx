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
  vi.unstubAllEnvs();
});

it("shows the dashboard shell and login without rendering private children", async () => {
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
  vi.stubEnv("PRIVY_APP_ID", "");
  vi.mocked(getDashboardSession).mockResolvedValue(null);
  render(await DashboardLayout({ children: <p>Private child</p> }));
  expect(screen.queryByText("Private child")).toBeNull();
  expect(screen.getByRole("heading", { name: "Login to connect to your Payr dashboard" })).toBeDefined();
  expect(screen.getByRole("navigation", { name: "Workspace" })).toBeDefined();
  expect(screen.getAllByRole("button", { name: "Login" })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
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
