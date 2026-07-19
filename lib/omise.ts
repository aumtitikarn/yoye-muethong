/**
 * Omise / Opn Payments server helpers.
 * Docs: https://docs.opn.ooo/
 *
 * All charge creation happens server-side with the SECRET key — the client only
 * ever holds the public key (used by Omise.js to tokenize card data / create a
 * payment source, so raw card numbers never touch our server).
 */

const OMISE_API_BASE = "https://api.omise.co";

export function getOmiseSecretKey(): string {
  const key = process.env.OMISE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Omise is not configured. Set OMISE_SECRET_KEY in .env (skey_test_… or skey_…)."
    );
  }
  return key;
}

function authHeader(): string {
  // HTTP Basic auth: username = secret key, empty password.
  return `Basic ${Buffer.from(`${getOmiseSecretKey()}:`).toString("base64")}`;
}

function baseHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Authorization: authHeader() };
  // Pin the API version if configured so response shapes stay stable.
  const version = process.env.OMISE_API_VERSION;
  if (version) headers["Omise-Version"] = version;
  return headers;
}

// ── Normalised shapes returned to callers ──────────────────────────

export interface OmiseChargeResult {
  id: string;
  status: string; // "successful" | "pending" | "failed" | "expired" | ...
  paid: boolean;
  amount: number; // in the smallest currency unit (satang for THB)
  currency: string;
  /** Offsite redirect target for cards needing 3-D Secure or bank/wallet flows. */
  authorizeUri: string | null;
  /** PromptPay QR image URL (present only for PromptPay sources). */
  promptpayQrUri: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** Arbitrary key/value data we attached at charge creation. */
  metadata: Record<string, string>;
}

type OmiseChargeApi = {
  id: string;
  status: string;
  paid: boolean;
  amount: number;
  currency: string;
  authorize_uri?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  metadata?: Record<string, string> | null;
  source?: {
    scannable_code?: { image?: { download_uri?: string | null } | null } | null;
  } | null;
};

function normaliseCharge(c: OmiseChargeApi): OmiseChargeResult {
  return {
    id: c.id,
    status: c.status,
    paid: Boolean(c.paid),
    amount: c.amount,
    currency: c.currency,
    authorizeUri: c.authorize_uri ?? null,
    promptpayQrUri: c.source?.scannable_code?.image?.download_uri ?? null,
    failureCode: c.failure_code ?? null,
    failureMessage: c.failure_message ?? null,
    metadata: c.metadata ?? {},
  };
}

async function parseOrThrow(res: Response): Promise<OmiseChargeApi> {
  const data = (await res.json()) as OmiseChargeApi & {
    object?: string;
    code?: string;
    message?: string;
  };
  if (!res.ok || data.object === "error") {
    throw new Error(data.message ?? `Omise error (${res.status})`);
  }
  return data;
}

export interface CreateChargeInput {
  /** Nonce from Omise.js: a card token ("tokn_…") or a source ("src_…"). */
  nonce: string;
  /** Amount in the smallest currency unit (satang). */
  amount: number;
  currency?: string;
  /** Where offsite methods (3DS / banking / wallet) return the customer. */
  returnUri: string;
  /** Attached to the charge so the webhook can map it back to a booking. */
  metadata?: Record<string, string>;
}

/**
 * Create a charge from a client-side nonce. Card tokens charge synchronously
 * (may still need 3DS via authorize_uri); sources (PromptPay, internet banking,
 * TrueMoney, …) start as "pending" and complete asynchronously via webhook.
 */
export async function createCharge(
  input: CreateChargeInput
): Promise<OmiseChargeResult> {
  const params = new URLSearchParams();
  params.set("amount", String(input.amount));
  params.set("currency", input.currency ?? "thb");
  params.set("return_uri", input.returnUri);
  // A card nonce is a token; everything else is a payment source.
  if (input.nonce.startsWith("tokn")) {
    params.set("card", input.nonce);
  } else {
    params.set("source", input.nonce);
  }
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      params.set(`metadata[${k}]`, v);
    }
  }

  const res = await fetch(`${OMISE_API_BASE}/charges`, {
    method: "POST",
    headers: {
      ...baseHeaders(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  return normaliseCharge(await parseOrThrow(res));
}

/** Fetch the current state of a charge (used for polling + webhook verification). */
export async function retrieveCharge(id: string): Promise<OmiseChargeResult> {
  const res = await fetch(`${OMISE_API_BASE}/charges/${encodeURIComponent(id)}`, {
    headers: baseHeaders(),
  });
  return normaliseCharge(await parseOrThrow(res));
}
