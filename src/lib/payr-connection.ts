// Public gateway configuration only. Workspace credentials never belong here.
export const PAYR_GATEWAY_URL = "https://api.payrlink.xyz";
export const PAYR_GATEWAY_MCP_URL = `${PAYR_GATEWAY_URL}/mcp`;

export const PAYR_CONNECTION_PROMPT = `Help me connect Payr to my agent through its remote HTTP MCP server:
${PAYR_GATEWAY_MCP_URL}

Setup guide: https://payrlink.xyz/install
No plugin download is required. The optional plugin is archived.

1. Identify my client. In Claude/Cowork, guide me through Customize > Connectors > Add custom connector, name it Payr, and use the server URL above. In Cowork, open the Cowork tab first. If you cannot operate these settings, give me the manual steps. For Claude Code, propose: claude mcp add --transport http payr ${PAYR_GATEWAY_MCP_URL}
For Codex, propose: codex mcp add payr --url ${PAYR_GATEWAY_MCP_URL}
Preserve existing MCP connections and ask before changing configuration.

2. Initialize the connection and discover its actual tools. Tool discovery proves the server is reachable, not that my workspace is connected. Use the discovered schemas; gateway tools may wrap inputs in requestBody.input. Do not assume a void or wallet-discovery tool exists. The currently imported gateway catalog lacks get_account_context and must be refreshed for the current Publish & Send contract before publication is available.

3. Help me sign in to Payr and open https://payrlink.xyz/app/connections. Use a REST gateway connection for the operator-registered service. Prefer a verified private credential path if available. Otherwise explain the hackathon-only body-credential fallback BEFORE asking for a credential: it is model-visible and may remain in chat, tool history and Bazantic traces. Ask for my explicit consent to this exposure. Use only a short-lived, minimally scoped credential for a dedicated demo workspace with test data; recommend a one-day expiry and revocation after the demo. Never request the gateway's service key, wallet private keys, seed phrases, session tokens or cookies.

4. Only after I consent, let me supply the demo account credential, or ask permission to read PAYR_ACCOUNT_CREDENTIAL if my local client can access it. Reading an environment variable into a tool argument exposes it to the model too. Use the raw credential without a Bearer prefix in requestBody.accountCredential beside requestBody.input, only if that field exists in the discovered schema. The upstream HTTP body uses top-level accountCredential beside input. Include it on each protected call, never inside input, and never on create_account_challenge or register_account. Do not echo the credential in replies, write it to files or include it in URLs. Do not request unrelated environment variables.
Bazantic does not forward Authorization upstream. Do not use codex mcp login payr or put the Payr account credential in the gateway Authorization header for this flow. Ask before removing an existing Payr bearer/header setting; leave unrelated settings untouched. MCP configuration does not automatically inject tool-body fields. If I decline exposure, the credential is unavailable, or the field is missing and no verified private path exists, stop at "Workspace access pending" and link the setup guide.

5. Call the read-only get_account tool and ask me to confirm that the returned workspace is mine. Report server discovery and verified workspace access separately. An authentication error or tool listing is not successful workspace verification. If authentication fails, stop mutation retries and check credential expiry, revocation and gateway configuration. After verified reconnection, continue an unchanged pending draft only with its original idempotency key; Publish & Send still needs separate explicit approval.

Do not register an account, create a draft, publish an invoice, change a profile, revoke access, send email or initiate payment during this connection check. Report what actually succeeded and any remaining manual steps.`;
