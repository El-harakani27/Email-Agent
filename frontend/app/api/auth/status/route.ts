import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/auth/status
 * Returns whether the user has valid Gmail tokens in their session.
 * The client calls this on mount to decide whether to show ConnectButton.
 */
export async function GET() {
  const cookieStore = cookies();
  const tokenCookie = cookieStore.get("gmail_tokens");
  return NextResponse.json({ connected: !!tokenCookie });
}

/**
 * DELETE /api/auth/status
 * Disconnects the user by clearing the token cookie.
 */
export async function DELETE() {
  const cookieStore = cookies();
  cookieStore.delete("gmail_tokens");
  return NextResponse.json({ connected: false });
}