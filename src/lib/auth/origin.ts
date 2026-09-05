import { IdentityError } from "../identity/contracts";

export function requireTrustedOrigin(request: Request, appOrigin: string): void {
  if (request.headers.get("origin") !== appOrigin || request.headers.get("host") !== new URL(appOrigin).host) {
    throw new IdentityError("ORIGIN_NOT_ALLOWED", 403);
  }
}
