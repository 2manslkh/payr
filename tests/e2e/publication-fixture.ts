import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fixtureDatabaseContainer } from "../../scripts/local-test-config.mjs";
import { createPublicationEnv } from "../../src/config/env";
import { canonicalJson } from "../../src/lib/domain/canonical-json";
import type { InvoiceActor } from "../../src/lib/invoices/contracts";
import type { InvoiceDocumentPort, PublicationRepository } from "../../src/lib/invoices/publication-contracts";
import { createPublicationService } from "../../src/lib/invoices/publication";
import { createPublicationWorker } from "../../src/lib/invoices/publication-worker";
import { createKeyedTokenCodec } from "../../src/lib/security/keyed-token";

// Disposable browser document fixtures intentionally model v1 no-send publications.
// They must never enable Resend just to exercise compiled PDF rendering.
export async function publishNoSendFixture(repository: PublicationRepository, actor: InvoiceActor,
  version: { draftId: string; version: number }, documents?: InvoiceDocumentPort) {
  fixtureDatabaseContainer();
  const config = createPublicationEnv();
  if (new URL(config.appOrigin).hostname !== "localhost" || process.env.PAYR_INVOICE_EMAIL_ENABLED !== "false") {
    throw new Error("No-send publication fixtures require the disabled-mail disposable browser runner");
  }
  const input = { draftId: version.draftId, expectedVersion: version.version, approval: true as const, idempotencyKey: randomUUID() };
  const requestFingerprint = createHash("sha256").update(canonicalJson({ operation: "publish_invoice", workspaceId: actor.workspaceId,
    draftId: input.draftId, expectedVersion: input.expectedVersion, approval: true })).digest("hex");
  const hash = () => `0x${randomBytes(32).toString("hex")}` as const;
  const tokenId = randomUUID();
  const token = createKeyedTokenCodec(config.keys).derive(tokenId, "invoice-bearer", config.activeKeyVersion);
  const attempt = await repository.reserve(actor, { ...input, requestFingerprint, attemptId: randomUUID(), invoiceKey: hash(), publicationSalt: hash(),
    tokenId, verifierHash: token.verifierHash, keyVersion: config.activeKeyVersion, chainId: config.chainId, contractAddress: config.contractAddress });
  if (documents) {
    const result = await createPublicationWorker(repository, config, documents).run(attempt.id);
    if (result.outcome !== "finalized") throw new Error("No-send fixture publication failed");
  } else {
    // Compile/render in Next rather than asking Playwright to transform PDF JSX.
    // All work in this runner is disposable and mail-disabled. Other test claims may run concurrently.
    for (let count = 0; count < 10; count++) {
      const response = await fetch(new URL("/api/jobs/publications", config.appOrigin), { method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" }, body: JSON.stringify({ limit: 10 }) });
      if (!response.ok) throw new Error("Compiled no-send publication worker failed");
      const status = await repository.statusData(actor, version.draftId);
      if (status?.attempt?.state === "finalized") break;
      if (status?.attempt?.state === "failed") throw new Error("Compiled no-send artifact verification failed");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return createPublicationService(repository, { getLinkConfig: () => config,
    getReservationConfig() { throw new Error("Fixture replay cannot reserve"); }, getDocuments() { throw new Error("Fixture replay cannot render"); },
  }).publish(actor, input);
}
