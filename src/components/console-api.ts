"use client";

import { useEffect, useState } from "react";

export class ConsoleError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
  }
}

export async function consoleApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ConsoleError("NETWORK_ERROR");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ConsoleError(typeof data?.error?.code === "string" ? data.error.code : "REQUEST_FAILED", response.status);
  if (!data) throw new ConsoleError("INVALID_RESPONSE");
  return data as T;
}

export function errorMessage(error: unknown): string {
  const code = error instanceof ConsoleError ? error.code : (error as { code?: unknown } | null)?.code;
  if (code === 4001 || code === "ACTION_REJECTED")
    return "You declined the wallet request. Nothing was signed. Try again when you are ready.";
  if (code === -32002)
    return "A wallet request is already open. Open your wallet to finish or cancel it, then try again.";
  if (code === "MISSING_WALLET")
    return "No Ethereum wallet was found. Enable a browser wallet or open Payr in your wallet's browser, then try again.";
  if (code === "WRONG_OWNER")
    return "Select the workspace owner account in your wallet, then try again. A payout account cannot authorize this change.";
  if (code === "INVALID_WALLET")
    return "Your wallet did not provide an Ethereum account or signature. Select a standard Ethereum account and try again. Smart accounts are not supported yet.";
  if (code === "NONCE_INVALID_OR_USED")
    return "This signing request expired or was already used. Start again for a fresh request; check Activity if you already signed.";
  if (code === "SIGNATURE_INVALID" || code === "INVALID_SIGNATURE")
    return "The signature could not be verified. Check the selected wallet account and try again with a fresh request.";
  if (code === "CLIENT_ALIAS_CONFLICT")
    return "That client alias is already in use. Choose another alias and save again; your details are still here.";
  if (code === "INVALID_COUNTRY_CODE")
    return "Enter an assigned ISO country code, such as GB, US or SG. Use GB rather than UK; your edits are still here.";
  if (code === "REVISION_CONFLICT" || (error instanceof ConsoleError && error.status === 409))
    return "This record changed elsewhere. Review the latest saved version before applying your edits.";
  if (code === "NETWORK_ERROR")
    return "Payr could not be reached. Your edits are still here. Check your connection and retry. If you submitted a change, check its saved state before repeating it.";
  if (error instanceof ConsoleError && error.status === 401)
    return "Your session has ended. Sign in again to continue. Your unsaved edits remain here until you leave this page.";
  if (error instanceof ConsoleError && error.status === 403)
    return "This request is not allowed from this session or address. Reopen Payr at its configured address and sign in again.";
  if (error instanceof ConsoleError && error.status === 429)
    return "Too many requests. Wait a minute, then try again. Your edits have not been cleared.";
  if (
    code === "CONFIGURATION_ERROR" ||
    code === "NOT_CONFIGURED" ||
    (error instanceof ConsoleError && error.status === 503)
  )
    return "Payr sign-in or workspace services are not configured for this deployment. Contact the operator, then retry once service is restored.";
  if (error instanceof ConsoleError && error.status === 400)
    return "Check the required fields and their formats, then try again. Your edits have not been cleared.";
  return "Payr could not complete this request. Your edits have not been cleared. Retry shortly; if you submitted a change, check its saved state first.";
}

export function useConsoleResource<T>(path: string) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    consoleApi<T>(path, undefined, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ data: null, error, loading: false });
      },
    );
    return () => controller.abort();
  }, [path, attempt]);
  return {
    ...state,
    retry: () => {
      setState((current) => ({ ...current, error: null, loading: true }));
      setAttempt((value) => value + 1);
    },
    update: (data: T) => setState({ data, error: null, loading: false }),
  };
}
