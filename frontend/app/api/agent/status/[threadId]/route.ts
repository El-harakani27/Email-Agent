import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * GET /api/agent/status/[threadId]
 * Proxy to FastAPI GET /agent/status/{thread_id}
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const res = await fetch(`${BACKEND}/agent/status/${params.threadId}`, { cache: "no-store" });
  const data = await res.json();
  console.log("Agent status response:", data);
  return NextResponse.json(data, { status: res.status });
}