import { NextRequest, NextResponse } from "next/server";

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
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
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function updateYouTubeVideo(
  accessToken: string,
  videoId: string,
  title: string,
  description: string
): Promise<{ ok: boolean; status?: number }> {
  // 1. 기존 snippet 가져오기
  const listRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (listRes.status === 401) return { ok: false, status: 401 };
  if (!listRes.ok) return { ok: false, status: listRes.status };

  const listData = await listRes.json();
  const snippet = listData.items?.[0]?.snippet;
  if (!snippet) return { ok: false, status: 404 };

  // 2. title/description 교체 후 업데이트
  const updateRes = await fetch(
    "https://www.googleapis.com/youtube/v3/videos?part=snippet",
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: videoId,
        snippet: { ...snippet, title, description },
      }),
    }
  );

  if (updateRes.status === 401) return { ok: false, status: 401 };
  if (!updateRes.ok) return { ok: false, status: updateRes.status };

  return { ok: true };
}

export async function POST(req: NextRequest) {
  let accessToken = req.cookies.get("yt_access_token")?.value;
  const refreshToken = req.cookies.get("yt_refresh_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  let body: { video_id?: string; title?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { video_id, title, description } = body;
  if (!video_id || !title || description === undefined) {
    return NextResponse.json({ error: "video_id, title, description 필수" }, { status: 400 });
  }

  let result = await updateYouTubeVideo(accessToken, video_id, title, description);

  // 401이면 토큰 갱신 후 재시도
  if (result.status === 401 && refreshToken) {
    const newToken = await refreshAccessToken(refreshToken);
    if (!newToken) {
      return NextResponse.json({ error: "인증 만료. 다시 로그인하세요." }, { status: 401 });
    }
    accessToken = newToken;
    result = await updateYouTubeVideo(accessToken, video_id, title, description);

    if (result.ok) {
      const response = NextResponse.json({ ok: true });
      response.cookies.set("yt_access_token", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
      return response;
    }
  }

  if (!result.ok) {
    if (result.status === 401) {
      return NextResponse.json({ error: "인증 만료. 다시 로그인하세요." }, { status: 401 });
    }
    if (result.status === 404) {
      return NextResponse.json({ error: "영상을 찾을 수 없음" }, { status: 404 });
    }
    return NextResponse.json({ error: `YouTube API 오류 (${result.status})` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
