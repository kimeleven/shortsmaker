import { NextRequest, NextResponse } from "next/server";

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expiry: number } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!data.access_token) return null;

    return {
      access_token: data.access_token,
      expiry: Date.now() + (data.expires_in || 3600) * 1000,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("yt_access_token")?.value;
  const refreshToken = req.cookies.get("yt_refresh_token")?.value;
  const expiry = Number(req.cookies.get("yt_token_expiry")?.value || "0");
  const email = req.cookies.get("yt_email")?.value || "";

  if (!accessToken) {
    return NextResponse.json({ authenticated: false });
  }

  // 토큰이 5분 이내로 만료 예정이면 갱신
  const needsRefresh = expiry < Date.now() + 5 * 60 * 1000;

  if (needsRefresh && refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed) {
      return NextResponse.json({ authenticated: false });
    }

    const response = NextResponse.json({ authenticated: true, email });
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax" as const,
    };
    response.cookies.set("yt_access_token", refreshed.access_token, cookieOptions);
    response.cookies.set("yt_token_expiry", String(refreshed.expiry), cookieOptions);
    return response;
  }

  if (needsRefresh && !refreshToken) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ authenticated: true, email });
}
