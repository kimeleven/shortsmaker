import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://shortsmaker-lovat.vercel.app";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/yttrans?auth=error`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/yttrans?auth=error`);
  }

  const redirectUri = `${baseUrl}/api/yttrans/oauth/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${baseUrl}/yttrans?auth=error`);
    }

    // 사용자 이메일 가져오기
    let email = "";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();
      email = userData.email || "";
    } catch {
      // 이메일 가져오기 실패 무시
    }

    const expiry = Date.now() + (tokenData.expires_in || 3600) * 1000;

    const response = NextResponse.redirect(`${baseUrl}/yttrans?auth=success`);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30일
      sameSite: "lax" as const,
    };

    response.cookies.set("yt_access_token", tokenData.access_token, cookieOptions);
    if (tokenData.refresh_token) {
      response.cookies.set("yt_refresh_token", tokenData.refresh_token, cookieOptions);
    }
    response.cookies.set("yt_token_expiry", String(expiry), cookieOptions);
    if (email) {
      response.cookies.set("yt_email", email, { ...cookieOptions, httpOnly: false });
    }

    return response;
  } catch {
    return NextResponse.redirect(`${baseUrl}/yttrans?auth=error`);
  }
}
