import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/auth/status
 * Returns whether the signed-in user has connected their Gmail account.
 */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ connected: false });
  }

  const res = await fetch(
    `${process.env.BACKEND_URL}/users/gmail-token/${userId}`
  );

  return NextResponse.json({ connected: res.ok });
}

/**
 * DELETE /api/auth/status
 * Disconnects Gmail by deleting the token row from the DB.
 */
export async function DELETE() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await fetch(`${process.env.BACKEND_URL}/users/gmail-token/${userId}`, {
    method: "DELETE",
  });

  return NextResponse.json({ connected: false });
}
