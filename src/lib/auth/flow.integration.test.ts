import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as issue } from "../../app/api/auth/nonce/route";
import { POST as verify } from "../../app/api/auth/verify/route";
import { GET as getProfile, POST as saveProfile } from "../../app/api/profile/route";
import { GET as listClients, POST as saveClient } from "../../app/api/clients/route";
import { GET as listConnectors, POST as createConnector } from "../../app/api/connectors/route";
import { POST as revokeConnector } from "../../app/api/connectors/[id]/revoke/route";
import { GET as listActivity } from "../../app/api/activity/route";
import { createConnectorAuthenticator } from "../connectors/auth";
import { getIdentityRuntime } from "./runtime";

afterEach(() => vi.unstubAllEnvs());

it("composes real signatures, atomic nonce consumption, sessions, profiles and revocable connectors", async () => {
  const origin = "http://localhost:3123";
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.stubEnv("ARC_CHAIN_ID", "5042002");
  vi.stubEnv("SESSION_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("CONNECTOR_TOKEN_PEPPER", randomBytes(32).toString("base64"));
  const owner = privateKeyToAccount(generatePrivateKey());
  const replacement = privateKeyToAccount(generatePrivateKey());
  let cookie = "";
  const request = (path: string, input?: unknown) => new Request(`${origin}${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      host: "localhost:3123",
      ...(cookie ? { cookie } : {}),
      ...(input === undefined ? {} : { origin, "content-type": "application/json" }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });

  const challengeResponse = await issue(request("/api/auth/nonce", { purpose: "payr-login-v1", wallet: owner.address }));
  expect(challengeResponse.status).toBe(200);
  const challenge = await challengeResponse.json();
  const signature = await owner.signMessage({ message: challenge.message });
  const attempts = await Promise.all([1, 2].map(() => verify(request("/api/auth/verify", { nonceId: challenge.nonceId, signature }))));
  expect(attempts.map((response) => response.status).sort()).toEqual([200, 400]);
  const signedIn = attempts.find((response) => response.status === 200)!;
  cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
  const session = (await signedIn.json()).session;

  const profileResponse = await getProfile(request("/api/profile"));
  expect(profileResponse.status).toBe(200);
  expect(profileResponse.headers.get("cache-control")).toBe("private, no-store");
  const profile = (await profileResponse.json()).profile;
  expect(profile.payoutWallet).toBe(owner.address.toLowerCase());
  const billingAddress = { line1: "1 Test Road", city: "London", postalCode: "N1 1AA", countryCode: "GB" };
  const saved = await saveProfile(request("/api/profile", {
    expectedRevision: profile.revision, businessName: "Test Studio", billingAddress,
    contactName: "Test Owner", contactEmail: "owner@example.test", invoicePrefix: "INV", defaultPaymentTermsDays: 30,
  }));
  expect(saved.status).toBe(200);
  const savedProfile = (await saved.json()).profile;
  const payoutChallenge = await issue(request("/api/auth/nonce", {
    purpose: "payr-payout-change-v1", newPayoutWallet: replacement.address, expectedRevision: savedProfile.revision,
  }));
  expect(payoutChallenge.status).toBe(200);
  const payout = await payoutChallenge.json();
  const wrongSigner = await verify(request("/api/auth/verify", {
    nonceId: payout.nonceId, signature: await replacement.signMessage({ message: payout.message }),
  }));
  expect(wrongSigner.status).toBe(401);
  const changed = await verify(request("/api/auth/verify", {
    nonceId: payout.nonceId, signature: await owner.signMessage({ message: payout.message }),
  }));
  expect(changed.status).toBe(200);
  expect((await changed.json()).profile.payoutWallet).toBe(replacement.address.toLowerCase());

  const client = await saveClient(request("/api/clients", {
    id: null, expectedRevision: null, alias: "client", businessName: "Test Client", billingAddress,
    contactName: "Test Person", contactEmail: "client@example.test",
  }));
  expect(client.status).toBe(200);
  const clients = await listClients(request("/api/clients"));
  expect(clients.status).toBe(200);
  expect((await clients.json()).clients).toHaveLength(1);

  const created = await createConnector(request("/api/connectors", { expiresInDays: 7 }));
  expect(created.status).toBe(200);
  const credentials = await created.json();
  const listing = await listConnectors(request("/api/connectors"));
  expect(listing.status).toBe(200);
  const listingBody = await listing.json();
  expect(listingBody.connectors).toHaveLength(1);
  expect(Object.keys(listingBody.connectors[0]).sort()).toEqual(["createdAt", "expiresAt", "id", "lastUsedAt", "revokedAt", "scopes"]);
  const { repository, config } = getIdentityRuntime();
  const authenticator = createConnectorAuthenticator(repository, config);
  const admitted = await authenticator.authenticate({ token: credentials.token, ip: "127.0.0.1", action: "invoice:status" });
  expect(admitted.workspaceId).toBe(session.workspaceId);
  const revoked = await revokeConnector(request(`/api/connectors/${credentials.connector.id}/revoke`, {}), {
    params: Promise.resolve({ id: credentials.connector.id }),
  });
  expect(revoked.status).toBe(200);
  await expect(authenticator.authenticate({ token: credentials.token, ip: "127.0.0.1", action: "invoice:status" })).rejects.toBeDefined();
  const activity = await listActivity(request("/api/activity"));
  expect(activity.status).toBe(200);
  const events = (await activity.json()).events;
  expect(events.some((event: { action: string; outcome: string }) => event.action === "invoice:status" && event.outcome === "denied")).toBe(true);
});
