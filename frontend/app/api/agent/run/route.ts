import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * POST /api/agent/run
 * Reads the Gmail tokens from the httpOnly cookie and forwards them
 * to the FastAPI backend to start the agent run.
 * The client never sees the raw tokens.
 */
export async function POST() {
  const cookieStore = cookies();
  const tokenCookie = cookieStore.get("gmail_tokens");

  if (!tokenCookie) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const tokens = JSON.parse(tokenCookie.value);

  const res = await fetch(`${BACKEND}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
    }),
  });

  const data = await res.json();
  console.log("Agent run response:", data);
  return NextResponse.json(data, { status: res.status });
}