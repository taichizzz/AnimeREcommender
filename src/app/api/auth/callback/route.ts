import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedVerifier = cookieStore.get("mal_pkce_verifier")?.value;
  const storedState = cookieStore.get("mal_oauth_state")?.value;

  const baseUrl = new URL(request.url).origin;

  // Validate state to prevent CSRF attacks
  if (!code || !storedVerifier || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }

  const redirectUri = `${baseUrl}/api/auth/callback`;

  // Exchange the authorization code for an access token
  const tokenRes = await fetch("https://myanimelist.net/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MAL_CLIENT_ID!,
      client_secret: process.env.MAL_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: storedVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/?error=token_failed", baseUrl));
  }

  const tokens = await tokenRes.json();

  const response = NextResponse.redirect(new URL("/dashboard", baseUrl));

  const secure = process.env.NODE_ENV === "production";

  response.cookies.set("mal_access_token", tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: tokens.expires_in,
    path: "/",
  });

  response.cookies.set("mal_refresh_token", tokens.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  // Clean up PKCE cookies
  response.cookies.delete("mal_pkce_verifier");
  response.cookies.delete("mal_oauth_state");

  return response;
}
