import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * GET /api/auth/callback
 * Google redirects here after the user grants Gmail permission.
 * Exchanges the code for tokens, then saves them to the DB via FastAPI
 * keyed by the Clerk user ID.
 */
export async function GET(request: NextRequest) {
  console.log("[callback] hit");

  const { userId } = await auth();
  console.log("[callback] userId:", userId);

  if (!userId) {
    console.log("[callback] no userId → redirecting to sign-in");
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  console.log("[callback] code:", !!code, "error:", error);

  if (error || !code) {
    return NextResponse.redirect(new URL("/?auth=error", request.url));
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  console.log("[callback] Google token exchange status:", tokenRes.status);
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.log("[callback] Google token exchange error:", err);
    return NextResponse.redirect(new URL("/?auth=error", request.url));
  }

  const tokens = await tokenRes.json();
  console.log("[callback] got tokens, access_token present:", !!tokens.access_token);

  // Ensure the user row exists in our DB
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
  console.log("[callback] upserting user:", userId, email);

  const upsertRes = await fetch(`${process.env.BACKEND_URL}/users/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clerk_user_id: userId, email }),
  });
  console.log("[callback] upsert status:", upsertRes.status);

  // Calculate token expiry
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  // Save Gmail tokens to DB keyed by Clerk user ID
  const saveRes = await fetch(`${process.env.BACKEND_URL}/users/gmail-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clerk_user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
    }),
  });

  console.log("[callback] save token status:", saveRes.status);
  if (!saveRes.ok) {
    const err = await saveRes.text();
    console.log("[callback] save token error:", err);
    return NextResponse.redirect(new URL("/?auth=error", request.url));
  }

  return NextResponse.redirect(new URL("/?auth=success", request.url));
}
