import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * POST /api/agent/draft
 * Reads Gmail tokens from the httpOnly cookie and proxies to FastAPI /agent/draft.
 * The client sends the email data; tokens are injected server-side.
 */
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const tokenCookie = cookieStore.get("gmail_tokens");

  if (!tokenCookie) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const tokens = JSON.parse(tokenCookie.value);
  const body = await req.json();

  const res = await fetch(`${BACKEND}/agent/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      ...body,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
