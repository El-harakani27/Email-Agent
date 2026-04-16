import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/snapshots
 * Returns all snapshot dates for the current user.
 * Used by the calendar to highlight days that have data.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${process.env.BACKEND_URL}/snapshots/${userId}`);
  if (!res.ok) return NextResponse.json({ snapshots: [] });

  const data = await res.json();
  return NextResponse.json({ snapshots: data });
}
