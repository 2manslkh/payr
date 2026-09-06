// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentUnavailableError } from "../documents/contracts";
import { canonicalJson } from "../domain/canonical-json";
import { getPublicationDocumentPort } from "./publication-runtime";
import { testPublicationSnapshot } from "./publication.test-support";

const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:1");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-service-role-key");
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockImplementation(async () => Response.json({ message: "PRIVATE_PROVIDER_DETAIL" }, { status: 403 }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("selects the real document port synchronously without document I/O or current publication configuration", () => {
  for (const name of ["SESSION_ENCRYPTION_KEY", "ARC_CHAIN_ID", "LINK_ACTIVE_KEY_VERSION", "NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS"]) {
    vi.stubEnv(name, "invalid");
  }
  expect(getPublicationDocumentPort().createOrRead).toBeTypeOf("function");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])("fails closed without %s before any document I/O", (name) => {
  vi.stubEnv(name, "");
  expect(() => getPublicationDocumentPort()).toThrow(expect.objectContaining({ code: "CONFIGURATION_ERROR", status: 503 }));
  expect(fetcher).not.toHaveBeenCalled();
});

it("uses private storage rather than synthetic proof and sanitizes storage unavailability", async () => {
  const invoiceId = "11111111-1111-4111-8111-111111111111";
  const invoiceNumber = "INV-2030-000001";
  await expect(getPublicationDocumentPort().createOrRead({
    storageKey: `workspace/${invoiceId}/invoice/${invoiceId}/1/attempt/${invoiceId}.pdf`,
    invoiceNumber, invoiceUrl: "https://payrlink.xyz/invoice/test-only", publicationSalt: `0x${"4".repeat(64)}`,
    canonicalInvoiceJson: canonicalJson({
      schemaVersion: "payr.invoice-document.v1", invoiceId, invoiceVersion: 1, invoiceNumber,
      invoiceKey: `0x${"3".repeat(64)}`, chainId: 5042002, contractAddress: `0x${"1".repeat(40)}`,
      invoice: testPublicationSnapshot(),
    }),
  })).rejects.toEqual(new DocumentUnavailableError());
  expect(fetcher).toHaveBeenCalled();
});
