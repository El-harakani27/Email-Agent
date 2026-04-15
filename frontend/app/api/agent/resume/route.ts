import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * POST /api/agent/resume
 * Proxy to FastAPI POST /agent/resume
 * Body: { thread_id: string, decision: "yes" | "no" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${BACKEND}/agent/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}