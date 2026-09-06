import type { InvoiceDocumentPort, PublicationLinkConfig, PublicationRepository, PublicationWorker } from "./publication-contracts";

export function createPublicationWorker(_repository: PublicationRepository, _config: PublicationLinkConfig, _documents: InvoiceDocumentPort): PublicationWorker {
  throw new Error("R05 implementation pending");
}
