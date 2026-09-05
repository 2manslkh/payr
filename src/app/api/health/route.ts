export async function GET() {
  return Response.json({
    status: "ok",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
