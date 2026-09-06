// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PublicationError, type PublicationRepository } from "../../../../lib/invoices/publication-contracts";
import { getPublicationDocumentPort, getPublicationLinkConfig, getPublicationRepository } from "../../../../lib/invoices/publication-runtime";
import { POST } from "./route";

vi.mock("../../../../lib/invoices/publication-runtime", () => ({
  getPublicationDocumentPort: vi.fn(), getPublicationLinkConfig: vi.fn(), getPublicationRepository: vi.fn(),
}));

const secret = "a".repeat(32);
const repository: PublicationRepository = {
  reserve: vi.fn(), claim: vi.fn(), store: vi.fn(), finalize: vi.fn(), fail: vi.fn(), statusData: vi.fn(), voidInvoice: vi.fn(), expire: vi.fn(),
};
const createOrRead = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", secret);
  vi.mocked(getPublicationDocumentPort).mockReturnValue({ createOrRead });
  vi.mocked(getPublicationLinkConfig).mockReturnValue({ appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app",
    activeKeyVersion: 1, keys: new Map([[1, new Uint8Array(32).fill(7)]]) });
  vi.mocked(getPublicationRepository).mockReturnValue(repository);
  vi.mocked(repository.claim).mockResolvedValue(null);
  vi.mocked(repository.expire).mockResolvedValue({ expired: 0 });
});
afterEach(() => vi.unstubAllEnvs());

function request(body: unknown = { limit: 1 }, authorization: string | null = `Bearer ${secret}`) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request("https://payrlink.xyz/api/jobs/publications", { method: "POST", headers, body: JSON.stringify(body) });
}
function privateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
function unopened() {
  expect(getPublicationDocumentPort).not.toHaveBeenCalled();
  expect(getPublicationRepository).not.toHaveBeenCalled();
  expect(repository.claim).not.toHaveBeenCalled();
  expect(repository.expire).not.toHaveBeenCalled();
}

it.each([null, "", "Bearer bad", `Bearer ${"b".repeat(32)}`, `Basic ${secret}`, `Bearer ${secret}, Bearer ${secret}`, `Bearer ${secret}x`])(
  "rejects invalid cron authorization before body/provider/repository (%#)", async (authorization) => {
    const req = request({ limit: 1 }, authorization);
    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "CRON_UNAUTHORIZED" });
    expect(req.bodyUsed).toBe(false);
    unopened();
    privateHeaders(response);
  },
);

it.each([undefined, "", "x".repeat(31)])("fails closed on absent/short cron configuration (%#)", async (value) => {
  vi.stubEnv("CRON_SECRET", value);
  const req = request();
  const response = await POST(req);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "CONFIGURATION_ERROR" });
  expect(req.bodyUsed).toBe(false);
  unopened();
});

it.each([{}, { limit: 0 }, { limit: 11 }, { limit: 1.5 }, { limit: "1" }, { limit: null }, { limit: 1, workspaceId: "SECRET" },
  { limit: 1, actor: "SECRET" }, { limit: 1, attemptId: "SECRET" }, { limit: 1, connectorId: "SECRET" }, { limit: 1, ownerWallet: "SECRET" }])(
  "validates strict bounded input and forbids caller actor/workspace/attempt overrides (%#)", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
    unopened();
    privateHeaders(response);
  },
);

it.each(["DOCUMENTS_NOT_CONFIGURED", "CONFIGURATION_ERROR"])("does not claim, reserve, or expire when %s", async (code) => {
  const gate = code === "DOCUMENTS_NOT_CONFIGURED" ? getPublicationDocumentPort : getPublicationLinkConfig;
  vi.mocked(gate).mockImplementation(() => { throw new PublicationError(code, 503); });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code });
  expect(getPublicationRepository).not.toHaveBeenCalled();
  expect(repository.claim).not.toHaveBeenCalled();
  expect(repository.reserve).not.toHaveBeenCalled();
  expect(repository.expire).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("runs the same privileged worker with no fabricated actor and stops when idle", async () => {
  const response = await POST(request({ limit: 10 }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ results: [{ outcome: "idle" }], expired: 0 });
  expect(repository.claim).toHaveBeenCalledExactlyOnceWith(null, expect.stringMatching(/^[0-9a-f-]{14}4[0-9a-f-]{21}$/));
  expect(repository.expire).toHaveBeenCalledExactlyOnceWith(10);
  expect(repository.reserve).not.toHaveBeenCalled();
  expect(repository.statusData).not.toHaveBeenCalled();
  expect(createOrRead).not.toHaveBeenCalled();
  privateHeaders(response);
});

it.each([1, 10])("bounds processing to %i claims, with unique worker IDs and sanitized retry outcomes", async (limit) => {
  vi.mocked(repository.claim).mockRejectedValue(new Error("SECRET https://provider.test salt"));
  const response = await POST(request({ limit }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ results: Array.from({ length: limit }, () => ({ outcome: "retryable" })), expired: 0 });
  expect(repository.claim).toHaveBeenCalledTimes(limit);
  expect(new Set(vi.mocked(repository.claim).mock.calls.map((call) => call[1])).size).toBe(limit);
  expect(repository.fail).not.toHaveBeenCalled();
  expect(repository.expire).toHaveBeenCalledExactlyOnceWith(limit);
  privateHeaders(response);
});

it("sanitizes expiry/provider configuration errors", async () => {
  vi.mocked(repository.expire).mockRejectedValue(new Error("SECRET https://provider.test"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
  expect(repository.claim).not.toHaveBeenCalled();
  privateHeaders(response);
});

it("uses the bounded body reader instead of trusting Content-Length", async () => {
  const req = request({ limit: 1, ignored: "x".repeat(16 * 1024) });
  req.headers.set("content-length", "1");
  const response = await POST(req);
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE" } });
  unopened();
});

it("rejects unsupported media", async () => {
  const req = request();
  req.headers.set("content-type", "text/plain");
  const response = await POST(req);
  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
  unopened();
});
