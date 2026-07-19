import crypto from "node:crypto";

/**
 * Lightweight HMAC-SHA256 signed JWT (HS256) using the built-in crypto module,
 * so we don't need to add a JWT dependency. Uses the JWT_SECRET from env.
 */

const SECRET = process.env.JWT_SECRET ?? "";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

export const SESSION_COOKIE = "session";

export interface SessionUser {
  /** LINE userId (sub) */
  sub: string;
  name: string;
  picture?: string;
  email?: string;
}

interface JwtPayload extends SessionUser {
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlJson(obj: unknown): string {
  return base64url(JSON.stringify(obj));
}

function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function parseDurationSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60; // default 7d
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };
  return amount * multipliers[unit];
}

function sign(data: string): string {
  return base64url(crypto.createHmac("sha256", SECRET).update(data).digest());
}

export function createSession(user: SessionUser): string {
  if (!SECRET) throw new Error("JWT_SECRET is not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: JwtPayload = {
    ...user,
    iat: now,
    exp: now + parseDurationSeconds(EXPIRES_IN),
  };

  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifySession(token: string | undefined | null): SessionUser | null {
  if (!token || !SECRET) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = sign(`${encodedHeader}.${encodedPayload}`);

  // constant-time compare
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64url(encodedPayload).toString()) as JwtPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    const { sub, name, picture, email } = payload;
    if (!sub) return null;
    return { sub, name, picture, email };
  } catch {
    return null;
  }
}

export function sessionMaxAge(): number {
  return parseDurationSeconds(EXPIRES_IN);
}
