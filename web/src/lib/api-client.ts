import { redlineConfig } from "./redline-config";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface AuthBridge {
  getToken: () => Promise<string | null>;
  displayName: string;
}

let bridge: AuthBridge | null = null;

/** Set by the session provider so data calls can attach the signed-in user's token. */
export const setAuthBridge = (next: AuthBridge | null) => { bridge = next; };

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth !== false) {
    const token = await bridge?.getToken();
    if (!token) throw new ApiError("Sign in to continue.", 401);
    headers.Authorization = `Bearer ${token}`;
    headers["X-Redline-Name"] = encodeURIComponent(bridge?.displayName ?? "").slice(0, 120);
  }
  let res: Response;
  try {
    res = await fetch(`${redlineConfig.apiBase}${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Cannot reach the Redline server. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status}).`, res.status);
  return data as T;
}
