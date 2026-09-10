// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { readAuthJson } from "./http";
import { apiError } from "./runtime";

afterEach(() => vi.useRealTimers());

it("bounds an unfinished auth body even when stream cancellation never settles", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const request = new Request("https://example.test/api/auth/privy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"action":')); }, cancel }),
    duplex: "half",
  } as RequestInit);
  let response: Response | undefined;
  const pending = readAuthJson(request).catch((error) => { response = apiError(error); });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(response?.status).toBe(408);
  expect(await response!.json()).toEqual({ error: { code: "REQUEST_TIMEOUT" } });
  await pending;
  expect(cancel).toHaveBeenCalledOnce();
  expect(request.body!.locked).toBe(false);
});
