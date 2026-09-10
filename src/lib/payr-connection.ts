// Public gateway configuration only. Workspace credentials never belong here.
export const PAYR_GATEWAY_URL = "https://api.payrlink.xyz";
export const PAYR_GATEWAY_MCP_URL = `${PAYR_GATEWAY_URL}/mcp`;

export const PAYR_CONNECTION_PROMPT = `Help me connect Payr to my agent through its remote HTTP MCP server:
${PAYR_GATEWAY_MCP_URL}

Setup guide: https://payrlink.xyz/install
No plugin download is required. The optional plugin is archived.

1. Identify my client. In Claude/Cowork, guide me through Customize > Connectors > Add custom connector, name it Payr, and use the server URL above. In Cowork, open the Cowork tab first. If you cannot operate these settings, give me the manual steps. For Claude Code, propose: claude mcp add --transport http payr ${PAYR_GATEWAY_MCP_URL}
Preserve existing MCP connections and ask before changing configuration.

2. Initialize the connection and discover its actual tools. Tool discovery proves the server is reachable, not that my workspace is connected. Use the discovered schemas; gateway tools may wrap inputs in requestBody.input. Do not assume a void or wallet-discovery tool exists. The currently imported gateway catalog lacks get_account_context and must be refreshed for the current Publish & Send contract before publication is available.

3. Help me sign in to Payr and open https://payrlink.xyz/app/connections. For this gateway, use a REST gateway connection for the operator-registered service. Workspace access needs my own scoped account credential, supplied through an operator-configured private credential path. Never ask me to paste credentials, private keys or cookies into chat or tool arguments. Never request the gateway's service key. Do not invent OAuth, a credential field, or header-forwarding support. If private credential injection is not configured, stop at "Workspace access pending" and explain that the gateway operator must complete setup.

4. Once private workspace authentication is configured, call the read-only get_account tool and ask me to confirm that the returned workspace is mine. Report server discovery and verified workspace access separately. An authentication error or tool listing is not successful workspace verification.

Do not register an account, create a draft, publish an invoice, change a profile, revoke access, send email or initiate payment during this connection check. Report what actually succeeded and any remaining manual steps.`;
