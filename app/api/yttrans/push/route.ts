import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

// YouTube BCP-47 언어코드 매핑 (우리 코드 → YouTube 코드)
const LANG_MAP: Record<string, string> = {
  "zh-CN": "zh-Hans",
  "yue": "zh-Hant",
};
function toYTLang(code: string): string {
  return LANG_MAP[code] || code;
}

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

type Translations = Record<string, { title: string; description: string }>;

async function pushLocalizations(
  accessToken: string,
  videoId: string,
  translations: Translations,
  defaultLanguage: string | null
): Promise<{ ok: boolean; status?: number; detail?: string }> {
  // 1. 기존 snippet + localizations 가져오기
  const listRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (listRes.status === 401) return { ok: false, status: 401 };
  if (!listRes.ok) return { ok: false, status: listRes.status };

  const listData = await listRes.json();
  const item = listData.items?.[0];
  if (!item) return { ok: false, status: 404 };

  const snippet = item.snippet;
  const existingLocalizations = item.localizations || {};

  // 2. defaultLanguage 결정: 기존값 > 파라미터 > 'ko' 폴백
  const resolvedDefaultLang = snippet.defaultLanguage || defaultLanguage || "ko";

  // 3. 번역 결과를 localizations에 병합 (YouTube 제한: 제목 100자, 설명 5000자)
  const newLocalizations = { ...existingLocalizations };
  for (const [lang, { title, description }] of Object.entries(translations)) {
    const ytLang = toYTLang(lang);
    if (!title && !description) continue;
    newLocalizations[ytLang] = {
      title: (title || "").slice(0, 100),
      description: (description || "").slice(0, 5000),
    };
  }

  // 4. snippet(writable 필드만) + localizations 동시 업데이트
  const writableSnippet = {
    title: snippet.title,
    description: snippet.description ?? "",
    categoryId: snippet.categoryId,
    defaultLanguage: resolvedDefaultLang,
    ...(snippet.tags && { tags: snippet.tags }),
    ...(snippet.defaultAudioLanguage && { defaultAudioLanguage: snippet.defaultAudioLanguage }),
  };

  const updateRes = await fetch(
    "https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations",
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: videoId,
        snippet: writableSnippet,
        localizations: newLocalizations,
      }),
    }
  );

  if (updateRes.status === 401) return { ok: false, status: 401 };
  if (!updateRes.ok) {
    const errBody = await updateRes.json().catch(() => ({}));
    console.error("update error:", JSON.stringify(errBody));
    return { ok: false, status: updateRes.status, detail: JSON.stringify(errBody) };
  }

  return { ok: true };
}

export async function POST(req: NextRequest) {
  let accessToken = req.cookies.get("yt_access_token")?.value;
  const refreshToken = req.cookies.get("yt_refresh_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  let body: { video_id?: string; translations?: Translations; default_language?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { video_id, translations, default_language = null } = body;
  if (!video_id || !translations || !Object.keys(translations).length) {
    return NextResponse.json({ error: "video_id, translations 필수" }, { status: 400 });
  }

  try {
    let result = await pushLocalizations(accessToken, video_id, translations, default_language);

    // 401이면 토큰 갱신 후 재시도
    if (result.status === 401 && refreshToken) {
      const newToken = await refreshAccessToken(refreshToken);
      if (!newToken) {
        return NextResponse.json({ error: "인증 만료. 다시 로그인하세요." }, { status: 401 });
      }
      accessToken = newToken;
      result = await pushLocalizations(accessToken, video_id, translations, default_language);

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
      return NextResponse.json({ error: `YouTube API 오류 (${result.status}): ${result.detail || ""}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push handler error:", e);
    return NextResponse.json({ error: `서버 오류: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
