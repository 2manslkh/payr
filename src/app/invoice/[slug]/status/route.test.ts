// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { resolve, project } = vi.hoisted(() => ({ resolve: vi.fn(), project: vi.fn() }));
vi.mock("../../../../lib/documents/runtime", () => ({ createDocumentRuntime: () => ({ access: { resolve }, config: {} }) }));
vi.mock("../../../../lib/payments/public-status", () => ({ publicPaymentStatus: project }));
beforeEach(() => { resolve.mockReset(); project.mockReset(); });
const context = { params: Promise.resolve({ slug: "test-only" }) };
it("requires a live bearer independently and returns only the canonical public projection", async () => {
  resolve.mockResolvedValue(null); expect((await GET(new Request("https://example.test"), context)).status).toBe(404); expect(project).not.toHaveBeenCalled();
  resolve.mockResolvedValue({ workspaceId: "private" }); project.mockReturnValue({ paymentStatus: "unpaid", settlement: null });
  const response = await GET(new Request("https://example.test"), context);
  expect(await response.json()).toEqual({ paymentStatus: "unpaid", settlement: null }); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(resolve).toHaveBeenLastCalledWith("test-only");
});
it("fails privately when access changes or the database fails", async () => {
  resolve.mockRejectedValue(new Error("secret")); const response = await GET(new Request("https://example.test"), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
});
