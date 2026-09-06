import type { InvoiceDocumentPort, PublicationConfig, PublicationRepository, PublicationService } from "./publication-contracts";

export function createPublicationService(_repository: PublicationRepository, _config: PublicationConfig, _documents: InvoiceDocumentPort): PublicationService {
  throw new Error("R05 implementation pending");
}
