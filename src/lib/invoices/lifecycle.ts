import type { InvoiceLifecycleService, PublicationLinkConfig, PublicationRepository, PublicationStatusData, PublicationView } from "./publication-contracts";

export function createInvoiceLifecycleService(_repository: PublicationRepository, _config: PublicationLinkConfig, _now: () => Date = () => new Date()): InvoiceLifecycleService {
  throw new Error("R05 implementation pending");
}

export function publicationView(_data: PublicationStatusData | null, _now: Date = new Date()): PublicationView {
  throw new Error("R05 implementation pending");
}
