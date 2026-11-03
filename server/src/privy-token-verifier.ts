import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Caller {
  userId: string;
  name: string;
}

export type TokenVerifier = (token: string) => Promise<string>;

/** Verifies a Privy access token (ES256 against the app's JWKS) and returns the Privy user id. */
export function createPrivyVerifier(appId: string): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: appId });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("token has no subject");
    return payload.sub;
  };
}

/** Display names are cosmetic and sent by the client, so they are trimmed and stripped of control characters. */
export function cleanName(raw: string | undefined): string {
  let decoded = raw ?? "";
  try { decoded = decodeURIComponent(decoded); } catch { /* keep the raw value */ }
  const value = decoded.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 60);
  return value || "Signed-in user";
}
