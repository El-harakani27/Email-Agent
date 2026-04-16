import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/snapshots/[date]
 * Returns the full snapshot (emails + agent result) for a specific date.
 * Date format: YYYY-MM-DD
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { date: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${process.env.BACKEND_URL}/snapshots/${userId}/${params.date}`
  );

  if (!res.ok) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(await res.json());
}
