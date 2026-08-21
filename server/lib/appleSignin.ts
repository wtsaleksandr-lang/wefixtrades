/**
 * "Continue with Apple" — Sign in with Apple sign-in helper.
 *
 * Mirrors server/lib/googleSignin.ts (plain identity sign-in for the
 * WeFixTrades portal login/signup), but Apple does three things
 * differently from Google / Facebook — ported from the battle-tested
 * QuoteFleet implementation (src/server/oauth/apple.ts):
 *
 *   1. The callback is a POST (response_mode=form_post), not a GET —
 *      handled by app.post("/api/auth/apple/callback"). The display NAME
 *      arrives only on the FIRST consent, in that POST's `user` field
 *      (a JSON string). parseAppleUserName() reads it when present and
 *      tolerates its absence on every later sign-in.
 *
 *   2. The `client_secret` is NOT a static string — it is a short-lived
 *      ES256 JWT we sign ourselves per token-exchange
 *      (buildAppleClientSecret). A 300s exp regenerated on every exchange
 *      means the secret can never expire on us. Signing key = the .p8
 *      private key (APPLE_PRIVATE_KEY, PKCS#8 PEM).
 *
 *   3. The user identity comes from the `id_token` the token endpoint
 *      returns, which we VERIFY against Apple's JWKS (verifyAppleIdToken)
 *      — audience is our Services ID, issuer is https://appleid.apple.com.
 *      Unlike Google there is no userinfo endpoint; the signed, verified
 *      token IS the profile source.
 *
 * Crypto uses `jsonwebtoken` (already a project dependency) for the ES256
 * sign + verify, and Node's built-in `crypto` to turn Apple's JWKS keys
 * into PEM. All network + key seams are injectable via the deps arg so the
 * unit test exercises the real flow with a local EC keypair and no network.
 */
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createLogger } from "./logger";

const log = createLogger("AppleSignin");

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_AUTHORIZE_URL = "https://appleid.apple.com/auth/authorize";
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

const HTTP_TIMEOUT_MS = 15_000;
/** client_secret JWT lifetime. Short + regenerated per exchange = never
 *  stale. Apple caps this at 6 months; 5 minutes is the safe minimum. */
const CLIENT_SECRET_TTL_S = 300;

/* ─── Config ───
   Four Doppler-provided pieces + a redirect URI. Unlike Google (which
   reuses one OAuth client for two flows) Apple has its own Services ID. */

export interface AppleSigninConfig {
  /** Services ID — the OAuth `client_id` and the id_token `aud`. */
  servicesId: string | null;
  /** Apple Developer Team ID — the client_secret `iss`. */
  teamId: string | null;
  /** Key ID of the .p8 signing key — the client_secret header `kid`. */
  keyId: string | null;
  /** The .p8 private key contents (PKCS#8 PEM; literal `\n` tolerated). */
  privateKey: string | null;
  /** Callback the browser is POSTed back to (form_post). */
  redirectUri: string;
  /** True only when all four secret pieces are present. */
  configured: boolean;
}

export function getAppleSigninConfig(): AppleSigninConfig {
  const servicesId = process.env.APPLE_OAUTH_CLIENT_ID || null;
  const teamId = process.env.APPLE_TEAM_ID || null;
  const keyId = process.env.APPLE_KEY_ID || null;
  const privateKey = process.env.APPLE_PRIVATE_KEY || null;
  // Dedicated redirect URI for the sign-in callback. Falls back to the
  // production URL so a missing env var doesn't break prod (mirrors the
  // Facebook flow's default).
  const redirectUri =
    process.env.APPLE_OAUTH_REDIRECT_URI ||
    "https://wefixtrades.com/api/auth/apple/callback";
  return {
    servicesId,
    teamId,
    keyId,
    privateKey,
    redirectUri,
    configured: !!(servicesId && teamId && keyId && privateKey),
  };
}

export function isAppleSigninConfigured(): boolean {
  return getAppleSigninConfig().configured;
}

/** The four pieces Apple's server-side crypto needs (non-null). */
export interface AppleSigningKeys {
  servicesId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

/** Claims we read off Apple's verified id_token. */
export interface AppleIdTokenClaims {
  sub?: string;
  email?: string;
  /** Apple sends this as the string 'true' | 'false' (sometimes boolean). */
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  [key: string]: unknown;
}

/** The resolved identity we hand back to the route — snake_case
 *  `email_verified` to read the same as GoogleProfile in the callback. */
export interface AppleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
}

/** Tolerate a single-line .p8 stored with literal "\n" (common in Doppler /
 *  env dashboards) as well as a real multi-line PEM. */
function normalizePem(privateKey: string): string {
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

/**
 * Build the ES256-signed `client_secret` JWT for a token-exchange.
 * Header: { alg:'ES256', kid: keyId }. Claims: iss=teamId, iat=now,
 * exp=now+300, aud='https://appleid.apple.com', sub=servicesId. Pure +
 * exported so the test can decode and assert the header/claims and verify
 * the signature with the public half of a test EC keypair.
 */
export function buildAppleClientSecret(
  keys: AppleSigningKeys,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const pem = normalizePem(keys.privateKey);
  // iat/exp are set explicitly in the payload (jsonwebtoken keeps provided
  // iat/exp) so a test can pin them; iss/sub/aud live in the payload too to
  // avoid the "bad option" collision jsonwebtoken throws when a claim is set
  // both in the payload and via the matching option.
  return jwt.sign(
    {
      iss: keys.teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_TTL_S,
      aud: APPLE_ISSUER,
      sub: keys.servicesId,
    },
    pem,
    { algorithm: "ES256", keyid: keys.keyId },
  );
}

/**
 * Resolves the PEM verification key for an id_token header — Apple's remote
 * JWKS in production, a test key injected in unit tests.
 */
export type AppleKeyResolver = (header: {
  kid?: string;
  alg?: string;
}) => Promise<string | crypto.KeyObject>;

/** Cached Apple JWKS (public keys rotate rarely; refetched on cache miss). */
let cachedJwks: { keys: Array<Record<string, unknown>>; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchAppleJwks(fetchImpl: typeof fetch): Promise<Array<Record<string, unknown>>> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const res = await fetchImpl(APPLE_JWKS_URL, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`apple JWKS fetch failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { keys?: Array<Record<string, unknown>> };
  if (!data.keys || !data.keys.length) throw new Error("apple JWKS returned no keys");
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

/** Default resolver: fetch Apple's JWKS, pick the key by `kid`, convert the
 *  JWK to a SPKI PEM `jsonwebtoken` can verify with. */
function makeAppleJwksResolver(fetchImpl: typeof fetch): AppleKeyResolver {
  return async (header) => {
    const keys = await fetchAppleJwks(fetchImpl);
    const jwk =
      (header.kid && keys.find((k) => k.kid === header.kid)) || keys[0];
    if (!jwk) throw new Error("apple JWKS: no matching key for id_token kid");
    return crypto
      .createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" })
      .export({ type: "spki", format: "pem" })
      .toString();
  };
}

/**
 * Verify an Apple id_token. `keyResolver` supplies the public key (Apple's
 * JWKS in production; the test injects a local key). Enforces issuer =
 * appleid.apple.com and audience = our Services ID (jsonwebtoken also
 * enforces exp).
 */
export async function verifyAppleIdToken(
  idToken: string,
  servicesId: string,
  keyResolver: AppleKeyResolver,
): Promise<AppleIdTokenClaims> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new Error("apple id_token could not be decoded");
  }
  const key = await keyResolver(decoded.header as { kid?: string; alg?: string });
  const claims = jwt.verify(idToken, key as jwt.Secret, {
    algorithms: ["ES256"],
    issuer: APPLE_ISSUER,
    audience: servicesId,
  }) as AppleIdTokenClaims;
  return claims;
}

/**
 * Parse the first-consent `user` field (a JSON string in the form_post
 * body) into a display name. Present ONLY on the very first authorization;
 * every later sign-in omits it, so absence/blank/malformed all resolve
 * cleanly to null.
 */
export function parseAppleUserName(userField: unknown): string | null {
  if (typeof userField !== "string" || !userField.trim()) return null;
  try {
    const parsed = JSON.parse(userField) as {
      name?: { firstName?: string; lastName?: string };
    };
    const first = parsed?.name?.firstName?.trim() || "";
    const last = parsed?.name?.lastName?.trim() || "";
    const full = `${first} ${last}`.trim();
    return full || null;
  } catch {
    return null;
  }
}

/** Injected network + key seams (defaults are the real fetch + Apple JWKS). */
export interface AppleExchangeDeps {
  fetchImpl?: typeof fetch;
  /** id_token verification key resolver (default = Apple's remote JWKS). */
  keyResolver?: AppleKeyResolver;
  /** Current time in ms (default Date.now) — lets tests pin iat/exp. */
  now?: () => number;
}

/**
 * Exchange an Apple authorization code for the user's verified profile:
 *   1. sign a fresh ES256 client_secret,
 *   2. POST it + the code to Apple's token endpoint,
 *   3. VERIFY the returned id_token against Apple's JWKS,
 *   4. return { sub, email, email_verified, name } — `name` from the
 *      first-consent form_post `user` field (null on later sign-ins).
 * Throws on any failure (the route maps it to a friendly redirect).
 */
export async function exchangeAppleCodeForProfile(
  code: string,
  appleName: string | null,
  keys: AppleSigningKeys & { redirectUri: string },
  deps: AppleExchangeDeps = {},
): Promise<AppleProfile> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowMs = deps.now ? deps.now() : Date.now();

  const clientSecret = buildAppleClientSecret(keys, Math.floor(nowMs / 1000));

  const res = await fetchImpl(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: keys.servicesId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: keys.redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      `apple token exchange failed: ${String(err.error_description || err.error || res.statusText)}`,
    );
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("apple token exchange returned no id_token");

  const claims = await verifyAppleIdToken(
    data.id_token,
    keys.servicesId,
    deps.keyResolver ?? makeAppleJwksResolver(fetchImpl),
  );
  if (!claims.sub) throw new Error("apple id_token missing sub");
  const email = typeof claims.email === "string" ? claims.email.toLowerCase().trim() : "";
  if (!email) throw new Error("apple id_token missing email");
  const email_verified = claims.email_verified === true || claims.email_verified === "true";

  log.info("Apple sign-in profile resolved", { sub: String(claims.sub), email_verified });

  return {
    sub: String(claims.sub),
    email,
    email_verified,
    name: appleName?.trim() || null,
  };
}
