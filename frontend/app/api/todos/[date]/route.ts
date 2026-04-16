import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * GET /api/todos/[date]
 * Returns todos for the authenticated user on a specific date (YYYY-MM-DD).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { date: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BACKEND}/todos/${userId}/${params.date}`);
  if (!res.ok) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await res.json());
}
