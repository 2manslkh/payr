import { createPrivateHeaders } from "../../../../../lib/documents/private-response";
import { AuthorizationError } from "../../../../../lib/payments/authorize";
import { createPaymentRuntime } from "../../../../../lib/payments/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = createPrivateHeaders();
  try {
    // Next supplies a stream even for empty POSTs. Reject actual bytes, not stream presence.
    if (request.body !== null) {
      const reader = request.body.getReader();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Body deadline exceeded")), 5_000);
      });
      try {
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), deadline]);
          if (done) break;
          if (value.byteLength > 0) throw new Error("Unexpected body");
        }
      } catch {
        void reader.cancel().catch(() => {});
        throw new AuthorizationError("INVALID_INPUT", 400);
      } finally {
        clearTimeout(timer);
        reader.releaseLock();
      }
    }
    const { slug } = await params;
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "local" : "local";
    const result = await createPaymentRuntime().authorize(slug, ip);
    return Response.json(result, { headers });
  } catch (error) {
    const safe = error instanceof AuthorizationError ? error : new AuthorizationError("AUTHORIZATION_DENIED", 503);
    return Response.json({ code: safe.code }, { status: safe.status, headers });
  }
}
