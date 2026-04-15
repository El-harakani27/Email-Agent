import { NextResponse } from "next/server";

/**
 * GET /api/auth/google
 * Redirects the user to Google's OAuth2 consent screen.
 */
export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    // gmail.modify covers reading + creating drafts
    scope: [
      "https://www.googleapis.com/auth/gmail.modify",
      "email",
      "profile",
    ].join(" "),
    access_type: "offline",  // get a refresh_token
    prompt: "consent",       // force consent screen so we always get refresh_token
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return NextResponse.redirect(authUrl);
}