import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * POST /api/agent/run
 * Fetches Gmail tokens from DB, then forwards the run request to FastAPI.
 * Accepts optional { target_date: "YYYY-MM-DD" } — defaults to today if omitted.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Fetch Gmail tokens from DB
  const tokenRes = await fetch(`${BACKEND}/users/gmail-token/${userId}`);
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const tokens = await tokenRes.json();

  const res = await fetch(`${BACKEND}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clerk_user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      target_date: body.target_date ?? null,  // null = today
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
