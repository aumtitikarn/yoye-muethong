/**
 * LINE Login (OAuth 2.0 / OpenID Connect) helpers.
 * Docs: https://developers.line.biz/en/docs/line-login/integrate-line-login/
 */

import type { NextRequest } from "next/server";

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export const LINE_STATE_COOKIE = "line_oauth_state";

export function getLineConfig() {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    throw new Error(
      "LINE Login is not configured. Set LINE_LOGIN_CHANNEL_ID and LINE_LOGIN_CHANNEL_SECRET in .env"
    );
  }
  return { channelId, channelSecret };
}

/**
 * The public origin of the app. Behind a tunnel/reverse-proxy (e.g. Cloudflare
 * trycloudflare) the request hits localhost, so req.nextUrl.origin is wrong.
 * Priority: the configured redirect URI's origin → forwarded headers → request.
 */
export function getPublicOrigin(req: NextRequest): string {
  const explicit = process.env.LINE_LOGIN_REDIRECT_URI;
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // fall through to header/request detection
    }
  }
  const host = req.headers.get("x-forwarded-host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    return `${proto ?? "https"}://${host}`;
  }
  return req.nextUrl.origin;
}

/**
 * The redirect URI must exactly match one registered in the LINE Developers
 * console (LINE Login channel → Callback URL). Defaults to the current origin.
 */
export function getRedirectUri(origin: string): string {
  return process.env.LINE_LOGIN_REDIRECT_URI ?? `${origin}/api/auth/line/callback`;
}

export function buildAuthorizeUrl(params: {
  origin: string;
  state: string;
  nonce: string;
}): string {
  const { channelId } = getLineConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", getRedirectUri(params.origin));
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", "profile openid email");
  url.searchParams.set("nonce", params.nonce);
  // Prompt the user to add the linked LINE Official Account as a friend so we
  // can push messages to them later (Messaging API push only reaches friends).
  url.searchParams.set("bot_prompt", "aggressive");
  return url.toString();
}

export interface LineTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export async function exchangeCodeForToken(params: {
  code: string;
  origin: string;
}): Promise<LineTokenResponse> {
  const { channelId, channelSecret } = getLineConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: getRedirectUri(params.origin),
    client_id: channelId,
    client_secret: channelSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE token exchange failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as LineTokenResponse;
}

export interface LineVerifiedProfile {
  /** LINE userId */
  sub: string;
  name: string;
  picture?: string;
  email?: string;
}

/**
 * Verify the id_token with LINE and return the profile claims. This validates
 * the token signature, audience (channel id) and the nonce we generated.
 */
export async function verifyIdToken(params: {
  idToken: string;
  nonce: string;
}): Promise<LineVerifiedProfile> {
  const { channelId } = getLineConfig();
  const body = new URLSearchParams({
    id_token: params.idToken,
    client_id: channelId,
    nonce: params.nonce,
  });

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE id_token verification failed (${res.status}): ${detail}`);
  }

  const claims = (await res.json()) as {
    sub: string;
    name?: string;
    picture?: string;
    email?: string;
  };

  return {
    sub: claims.sub,
    name: claims.name ?? "LINE User",
    picture: claims.picture,
    email: claims.email,
  };
}
