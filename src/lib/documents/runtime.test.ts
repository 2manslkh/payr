// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), origins: vi.fn(), admin: vi.fn(), repository: vi.fn(), storage: vi.fn() }));
vi.mock("../../config/env", () => ({ createDocumentAccessEnv: mocks.config, createDocumentRpcOrigins: mocks.origins }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("../db/documents", () => ({ createDocumentRepository: mocks.repository }));
vi.mock("./invoice-storage", () => ({ createPrivateDocumentStorage: mocks.storage }));

beforeEach(() => { vi.resetModules(); for (const mock of Object.values(mocks)) mock.mockReset(); });

it("imports without configuration reads and composes repository/storage with one runtime admin client", async () => {
  const { createDocumentRuntime } = await import("./runtime");
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  const client = {};
  const config = { appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", keys: new Map(), pepper: new Uint8Array(32) };
  const repository = { findCandidate: vi.fn(), readTarget: vi.fn(), admit: vi.fn(), storageState: vi.fn() };
  const storage = { read: vi.fn(), create: vi.fn() };
  mocks.config.mockReturnValue(config); mocks.origins.mockReturnValue([]); mocks.admin.mockReturnValue(client);
  mocks.repository.mockReturnValue(repository); mocks.storage.mockReturnValue(storage);
  const runtime = createDocumentRuntime();
  expect(runtime.config).toBe(config);
  expect(runtime.storage).toBe(storage);
  expect(typeof runtime.access.resolve).toBe("function");
  expect(mocks.repository).toHaveBeenCalledExactlyOnceWith(client);
  expect(mocks.storage).toHaveBeenCalledExactlyOnceWith(client);
});

it("replaces configuration/provider errors with a bounded operational error", async () => {
  const { createDocumentRuntime } = await import("./runtime");
  mocks.config.mockImplementation(() => { throw new Error("secret-environment-value"); });
  expect(() => createDocumentRuntime()).toThrow("DOCUMENT_UNAVAILABLE");
});
