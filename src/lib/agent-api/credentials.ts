import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createConnectorHasher } from "../connectors/crypto";
import { IdentityError } from "../identity/contracts";

export function mintAgentCredential(kind: "service" | "account") {
  const id = randomUUID();
  return { id, token: `${kind === "service" ? "pgw" : "pac"}_${id}.${randomBytes(32).toString("base64url")}` };
}

export function agentCredentialId(token: string, kind: "service" | "account") {
  const match = /^(pgw|pac)_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || token.length !== 84 || match[1] !== (kind === "service" ? "pgw" : "pac")
    || Buffer.from(match[3], "base64url").toString("base64url") !== match[3]) throw new IdentityError("AUTH_REQUIRED", 401);
  return match[2];
}

export function serviceCredentialHash(token: string) {
  return createHash("sha256").update(`payr:agent-gateway:service:v1:${token}`).digest("hex");
}

export function gatewayHash(pepper: Uint8Array, purpose: "ip" | "wallet", value: string) {
  if (pepper.byteLength < 32) throw new IdentityError("CONFIGURATION_ERROR", 503);
  return createHmac("sha256", pepper).update(`payr:agent-gateway:${purpose}:v1:${value}`).digest("hex");
}

export function accountCredentialHash(pepper: Uint8Array, token: string) {
  // Hash the prefix too: stripping pac_ must not turn a gateway key into a legacy MCP credential.
  return createConnectorHasher(pepper)("connector", token);
}
