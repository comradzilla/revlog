// Authentication utilities — uses Web Crypto API for Edge runtime compatibility
// (Next.js middleware runs in Edge, so no Node.js `crypto` module)

export const SESSION_COOKIE_NAME = "revradar_session";
export const SESSION_MAX_AGE_DAYS = 7;
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

// HMAC-SHA256 using Web Crypto API
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Create a signed session token: timestamp.hmac(timestamp, secret)
export async function createSessionToken(secret: string): Promise<string> {
  const timestamp = String(Date.now());
  const signature = await hmacSign(timestamp, secret);
  return `${timestamp}.${signature}`;
}

// Verify a session token: check HMAC + expiry
export async function verifySessionToken(
  token: string,
  secret: string,
  maxAgeDays: number = SESSION_MAX_AGE_DAYS
): Promise<boolean> {
  if (!token || !secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // Check expiry
  const age = Date.now() - ts;
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  if (age > maxAge || age < 0) return false;

  // Verify HMAC
  const expected = await hmacSign(timestamp, secret);
  if (expected.length !== signature.length) return false;

  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
