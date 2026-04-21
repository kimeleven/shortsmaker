import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  const clearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    sameSite: "lax" as const,
  };

  response.cookies.set("yt_access_token", "", clearOptions);
  response.cookies.set("yt_refresh_token", "", clearOptions);
  response.cookies.set("yt_token_expiry", "", clearOptions);
  response.cookies.set("yt_email", "", { ...clearOptions, httpOnly: false });

  return response;
}
