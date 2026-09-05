import type { IdentityConfig, IdentityRepository, IdentitySession } from "../identity/contracts";

export function getIdentityRuntime(): { config: IdentityConfig; repository: IdentityRepository } {
  throw new Error("F2 implementation pending");
}

export async function readRequestSession(_request: Request): Promise<IdentitySession | null> {
  throw new Error("F2 implementation pending");
}

export async function requireRequestSession(_request: Request, _mutation = false): Promise<IdentitySession> {
  throw new Error("F2 implementation pending");
}

export async function getDashboardSession(): Promise<IdentitySession | null> {
  throw new Error("F2 implementation pending");
}

export function privateJson(_data: unknown, _status = 200): Response {
  throw new Error("F2 implementation pending");
}

export function apiError(_error: unknown): Response {
  throw new Error("F2 implementation pending");
}
