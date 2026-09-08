import { z } from "zod";
import { parsePublicEnv } from "../src/config/env";

async function main() {
  if (process.argv.length > 3) throw new Error("Unexpected arguments");
  const limit = z.coerce.number().int().min(1).max(50).parse(process.argv[2] ?? "10");
  const origin = parsePublicEnv(process.env).NEXT_PUBLIC_APP_URL;
  const secret = z.string().min(32).parse(process.env.CRON_SECRET);
  const resultSchema = z.object({ outcome: z.enum(["idle", "disabled", "ready", "failed", "retry_wait", "lease_lost", "sent", "manual_review", "sending", "pending"]).optional(),
    id: z.string().uuid().optional(), ranges: z.number().int().nonnegative().optional(), events: z.number().int().nonnegative().optional() }).strict();
  for (const job of ["reconcile", "receipts", "outbox"] as const) {
    for (let iteration = 0; iteration < (job === "reconcile" ? 1 : limit); iteration++) {
      const response = await fetch(new URL(`/api/jobs/${job}`, origin), { headers: { Authorization: `Bearer ${secret}` },
        redirect: "error", signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new Error("Worker unavailable");
      const result = resultSchema.parse(await response.json());
      console.log(JSON.stringify({ job, ...result }));
      if (result.outcome === "idle" || result.outcome === "disabled") break;
    }
  }
}
main().catch(() => { console.error("Worker invocation stopped. Check private configuration and worker state; no credentials, recipients, or document links are logged."); process.exitCode = 1; });
