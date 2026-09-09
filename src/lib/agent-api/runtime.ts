import { getIdentityRuntime } from "../auth/runtime";
import { createSupabaseAdminClient } from "../db/admin";
import { createGatewayRepository } from "../db/agent-gateway";
import { getDraftRepository } from "../invoices/runtime";
import { createMcpRuntime } from "../mcp/runtime";
import { createAgentApi } from "./service";

export function createAgentRuntime() {
  return createAgentApi({ config: getIdentityRuntime().config,
    repository: createGatewayRepository(createSupabaseAdminClient()),
    services: createMcpRuntime().services,
    drafts: { listInvoices: (actor, input) => getDraftRepository().listInvoices(actor, input),
      getInvoiceDetail: (actor, id) => getDraftRepository().getInvoiceDetail(actor, id) },
  });
}
