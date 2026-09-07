// @vitest-environment node
import { Readable } from "node:stream";
import { NextRequestAdapter } from "next/dist/server/web/spec-extension/adapters/next-request";
import { NodeNextRequest } from "next/dist/server/base-http/node";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthorizationError } from "../../../../../lib/payments/authorize";
import { POST } from "./route";

const { authorize } = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("../../../../../lib/payments/runtime", () => ({ createPaymentRuntime: () => ({ authorize }) }));
const context = { params: Promise.resolve({ slug: "test-bearer" }) };
beforeEach(() => { authorize.mockReset(); });

it("returns persisted authorization with private response headers", async () => {
  authorize.mockResolvedValue({ schemaVersion: "payr.payment-authorization.v1" });
  const response = await POST(new Request("https://example.test/api/invoice/test-bearer/authorize", { method: "POST" }), context);
  expect(response.status).toBe(200);
  expect(authorize).toHaveBeenCalledExactlyOnceWith("test-bearer", "local");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("accepts a zero-byte POST through the installed Next Node request adapter", async () => {
  authorize.mockResolvedValue({ schemaVersion: "payr.payment-authorization.v1" });
  const incoming = Object.assign(Readable.from([]), {
    method: "POST", url: "https://example.test/api/invoice/test-bearer/authorize",
    headers: { "content-length": "0" },
  }) as IncomingMessage;
  const request = NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming), new AbortController().signal);
  expect(request.body).not.toBeNull();
  const response = await POST(request, context);
  expect(response.status).toBe(200);
  expect(authorize).toHaveBeenCalledExactlyOnceWith("test-bearer", "local");
});

it("accepts an actual empty HTTP POST without a content type", async () => {
  authorize.mockResolvedValue({ schemaVersion: "payr.payment-authorization.v1" });
  const server = createServer(async (incoming, outgoing) => {
    const request = NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming), new AbortController().signal);
    const response = await POST(request, context);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/authorize`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemaVersion: "payr.payment-authorization.v1" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(authorize).toHaveBeenCalledExactlyOnceWith("test-bearer", "local");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

it("rejects the first body byte despite a false zero length and cancels without waiting for EOF", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array([32])); }, cancel,
  });
  const request = new Request("https://example.test", {
    method: "POST", headers: { "content-length": "0" }, body, duplex: "half",
  } as RequestInit);
  const response = await POST(request, context);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(authorize).not.toHaveBeenCalled();
});

it("bounds waiting for an unfinished body and never signs on timeout", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  try {
    const body = new ReadableStream<Uint8Array>({ cancel });
    const responsePromise = POST(new Request("https://example.test", { method: "POST", body, duplex: "half" } as RequestInit), context);
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await responsePromise;
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(authorize).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("redacts stream errors without signing", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("private detail")); } });
  const response = await POST(new Request("https://example.test", { method: "POST", body, duplex: "half" } as RequestInit), context);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  expect(authorize).not.toHaveBeenCalled();
});

it("rejects client-supplied payment fields without signing", async () => {
  const response = await POST(new Request("https://example.test", { method: "POST", body: '{"amount":"1"}' }), context);
  expect(response.status).toBe(400);
  expect(authorize).not.toHaveBeenCalled();
});

it.each([new AuthorizationError("INVOICE_UNAVAILABLE", 404), new Error("secret key and RPC details")])("never leaks internal errors", async (error) => {
  authorize.mockRejectedValue(error);
  const response = await POST(new Request("https://example.test", { method: "POST" }), context);
  expect(response.status).toBe(error instanceof AuthorizationError ? 404 : 503);
  expect(await response.json()).toEqual({ code: error instanceof AuthorizationError ? "INVOICE_UNAVAILABLE" : "AUTHORIZATION_DENIED" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
