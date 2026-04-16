import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * POST /api/agent/draft
 * Fetches Gmail tokens from the DB using the Clerk userId,
 * then proxies to FastAPI /agent/draft with the email data.
 * The client never sees the raw tokens.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch Gmail tokens from DB
  const tokenRes = await fetch(`${BACKEND}/users/gmail-token/${userId}`);
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const tokens = await tokenRes.json();
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
