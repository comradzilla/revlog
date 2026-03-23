import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export async function POST(request: Request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!password || !secret) {
    return Response.json(
      { error: "Auth not configured. Set DASHBOARD_PASSWORD and SESSION_SECRET." },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body.password || "";

  // Constant-time comparison
  const inputBytes = new TextEncoder().encode(input);
  const expectedBytes = new TextEncoder().encode(password);

  let mismatch = inputBytes.length !== expectedBytes.length ? 1 : 0;
  const len = Math.max(inputBytes.length, expectedBytes.length);
  for (let i = 0; i < len; i++) {
    mismatch |= (inputBytes[i] || 0) ^ (expectedBytes[i] || 0);
  }

  if (mismatch !== 0) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSessionToken(secret);

  const res = Response.json({ success: true });
  res.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );

  return res;
}
