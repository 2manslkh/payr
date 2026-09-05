import { createHmac } from "node:crypto";
import { IdentityError } from "../identity/contracts";

export function createConnectorHasher(pepper: Uint8Array) {
  if (pepper.byteLength < 32) {
    throw new IdentityError("CONNECTOR_CONFIG_INVALID", 500);
  }
  const key = Buffer.from(pepper);
  return (purpose: "connector" | "connector-ip", value: string): string =>
    createHmac("sha256", key).update(`payr:${purpose}:v1:${value}`).digest("hex");
}
