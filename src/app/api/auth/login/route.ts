import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const clientId = process.env.MAL_CLIENT_ID!;
  const baseUrl = new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  // PKCE: MAL only supports the "plain" method, meaning code_challenge === code_verifier.
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeVerifier,
    code_challenge_method: "plain",
    state,
  });

  const authUrl = `https://myanimelist.net/v1/oauth2/authorize?${params}`;

  const response = NextResponse.redirect(authUrl);

  // Store verifier and state in short-lived cookies so the callback can use them
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  };

  response.cookies.set("mal_pkce_verifier", codeVerifier, cookieOptions);
  response.cookies.set("mal_oauth_state", state, cookieOptions);

  return response;
}
