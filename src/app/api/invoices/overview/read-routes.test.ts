import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRequestSession } from "../../../../lib/auth/runtime";
import { IdentityError } from "../../../../lib/identity/contracts";
import type { DraftRepository } from "../../../../lib/invoices/contracts";
import { DraftError } from "../../../../lib/invoices/errors";
import { getDraftRepository } from "../../../../lib/invoices/runtime";
import { GET as list } from "../route";
import { GET as detail } from "../[id]/route";
import { GET as overview } from "./route";

vi.mock("../../../../lib/auth/runtime", async (original) => ({
  ...await original<typeof import("../../../../lib/auth/runtime")>(), requireRequestSession: vi.fn(),
}));
vi.mock("../../../../lib/invoices/runtime", () => ({ getDraftRepository: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";
const identity = { workspaceId: id, ownerWallet: `0x${"1".repeat(40)}` };
const actor = { ...identity, connectorId: null };
const repository = { listInvoices: vi.fn(), getInvoiceDetail: vi.fn(), getOverview: vi.fn() };
const routes = [
  { name: "list", call: list, read: repository.listInvoices, path: "/api/invoices" },
  { name: "overview", call: overview, read: repository.getOverview, path: "/api/invoices/overview" },
  { name: "detail", call: (request: Request) => detail(request, { params: Promise.resolve({ id }) }), read: repository.getInvoiceDetail, path: `/api/invoices/${id}` },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRequestSession).mockResolvedValue(identity);
  vi.mocked(getDraftRepository).mockReturnValue(repository as unknown as DraftRepository);
});

describe.each(routes)("$name read route", ({ call, read, path }) => {
  it("authorizes an owner before creating a repository and returns the unchanged private DTO", async () => {
    const dto = { fixture: "repository projection" };
    read.mockResolvedValue(dto);
    const request = new Request(`https://payr.test${path}`);
    const response = await call(request);
    expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, false);
    expect(vi.mocked(requireRequestSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getDraftRepository).mock.invocationCallOrder[0]);
    expect(read.mock.calls[0][0]).toEqual(actor);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(dto);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("denies missing owner sessions, including bearer-only requests, before any DB access", async () => {
    vi.mocked(requireRequestSession).mockRejectedValue(new IdentityError("AUTH_REQUIRED", 401));
    const response = await call(new Request(`https://payr.test${path}?workspaceId=other`, { headers: { authorization: "Bearer connector-token" } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
    expect(getDraftRepository).not.toHaveBeenCalled();
  });

  it("rejects scope override query parameters before DB access", async () => {
    const response = await call(new Request(`https://payr.test${path}?workspaceId=other`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
    expect(getDraftRepository).not.toHaveBeenCalled();
  });

  it("does not expose provider text or details", async () => {
    read.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAILS"));
    const response = await call(new Request(`https://payr.test${path}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_ERROR" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

it("passes a bounded search/state/offset query with only the session's workspace", async () => {
  repository.listInvoices.mockResolvedValue({ items: [], hasMore: false });
  const response = await list(new Request("https://payr.test/api/invoices?search=North&state=expired&offset=100"));
  expect(response.status).toBe(200);
  expect(repository.listInvoices).toHaveBeenCalledExactlyOnceWith(actor, { search: "North", commercialState: "expired", offset: 100, limit: 50 });
});

it.each(["search=a&search=b", "state=paid", "offset=-1", "offset=10001", "limit=51"])("rejects invalid list query %s", async (query) => {
  const response = await list(new Request(`https://payr.test/api/invoices?${query}`));
  expect(response.status).toBe(400);
  expect(getDraftRepository).not.toHaveBeenCalled();
});

it("makes malformed, missing and cross-workspace invoice IDs indistinguishable", async () => {
  const request = new Request("https://payr.test/api/invoices/unknown");
  const malformed = await detail(request, { params: Promise.resolve({ id: "unknown" }) });
  expect(getDraftRepository).not.toHaveBeenCalled();
  repository.getInvoiceDetail.mockResolvedValue(null);
  const absent = await detail(request, { params: Promise.resolve({ id }) });
  repository.getInvoiceDetail.mockRejectedValue(new DraftError("NOT_FOUND", 404));
  const foreign = await detail(request, { params: Promise.resolve({ id }) });
  for (const response of [malformed, absent, foreign]) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_FOUND" });
  }
});
