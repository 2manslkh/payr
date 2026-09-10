import { getIdentityRuntime } from "../auth/runtime";
import { createConnectorAuthenticator } from "../connectors/auth";
import { createInvoiceDraftService } from "../invoices/service";
import { createPublicationService } from "../invoices/publication";
import { createInvoiceLifecycleService } from "../invoices/lifecycle";
import { getDraftRepository } from "../invoices/runtime";
import { afterPublication, getPublicationEmailConfig, getPublicationRepository, getPublicationConfig, getPublicationDocumentPort, getPublicationLinkConfig } from "../invoices/publication-runtime";
import type { McpRuntime } from "./transport";
import { createConnectorSenderService } from "../profiles/connector";
import { createAccountContextService } from "../privy/account-context";
import { createSupabaseAdminClient } from "../db/admin";

export function createMcpRuntime(): McpRuntime {
  const { config, repository } = getIdentityRuntime();
  return { appOrigin: config.appOrigin, authenticate: createConnectorAuthenticator(repository, config).authenticate,
    services: {
      getAccountContext: (actor, input) => createAccountContextService(createSupabaseAdminClient())(actor, input),
      ...createConnectorSenderService(repository),
      createDraft: (actor, input) => createInvoiceDraftService(getDraftRepository()).createDraft(actor, input),
      publish: (actor, input) => createPublicationService(getPublicationRepository(), {
        getReservationConfig: getPublicationConfig, getLinkConfig: getPublicationLinkConfig, getDocuments: getPublicationDocumentPort,
        getEmailConfig: getPublicationEmailConfig, afterPublication,
      }).publish(actor, input),
      status: (actor, id) => createInvoiceLifecycleService(getPublicationRepository(), getPublicationLinkConfig).status(actor, id),
      void: (actor, input) => createInvoiceLifecycleService(getPublicationRepository(), getPublicationLinkConfig).void(actor, input),
    },
  };
}
