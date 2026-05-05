import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const baseUrl = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/", baseUrl));
  response.cookies.delete("mal_access_token");
  response.cookies.delete("mal_refresh_token");
  return response;
}
