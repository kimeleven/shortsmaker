import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// YouTube oEmbed로 영상 정보 가져오기 (API 키 불필요)
async function fetchVideoInfo(videoId: string) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("영상 정보를 가져올 수 없습니다.");
  return res.json() as Promise<{ title: string; author_name: string; thumbnail_url: string }>;
}

function extractVideoId(input: string): string | null {
  // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/shorts/ID, or plain ID
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

function buildPrompt(
  videoInfo: { title: string; author_name: string },
  platform: "tistory" | "naver",
  youtubeUrl: string
) {
  const platformGuide =
    platform === "tistory"
      ? `티스토리 블로그 형식으로 작성하세요.
- HTML 태그 사용 가능 (h2, h3, p, blockquote, strong, em, br, a, img)
- 깔끔한 HTML 포맷으로 출력
- 이미지 위치 표시: [IMAGE: 설명] 형태로 삽입 위치 표시`
      : `네이버 블로그 형식으로 작성하세요.
- 순수 텍스트 기반 (HTML 태그 사용하지 않음)
- 줄바꿈으로 문단 구분
- 이모지 적절히 활용
- 이미지 위치 표시: [IMAGE: 설명] 형태로 삽입 위치 표시
- 구분선은 ───── 사용`;

  return `당신은 음악 전문 블로거입니다. 아래 YouTube 음악 영상에 대한 블로그 글을 작성하세요.

## 영상 정보
- 제목: ${videoInfo.title}
- 아티스트/채널: ${videoInfo.author_name}
- YouTube 링크: ${youtubeUrl}

## 작성 가이드
${platformGuide}

## 블로그 구조
1. 매력적인 제목 (검색 최적화 고려)
2. 도입부 - 아티스트/곡 소개 (독자 흥미 유발)
3. 곡 분석 - 장르, 분위기, 악기 구성, 보컬 특징 등
4. 가사/메시지 해석 (알려진 곡인 경우)
5. 추천 감상 상황 (출퇴근, 운동, 카페 등)
6. YouTube 영상 링크로 유도 - "지금 바로 들어보세요!" 느낌으로 자연스럽게 랜딩
7. 관련 추천곡 2-3개 언급

## 중요 규칙
- 글 분량: 1500~2500자
- YouTube 링크(${youtubeUrl})를 자연스럽게 본문에 2~3회 삽입하여 클릭 유도
- SEO 키워드를 자연스럽게 포함
- 저작권 문제가 없는 범위에서 작성
- 블로그 제목과 본문만 출력 (다른 설명 없이)

출력 형식:
---TITLE---
(블로그 제목)
---BODY---
(블로그 본문)`;
}

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const body = await req.json();
  const { youtubeUrl, platform } = body as { youtubeUrl: string; platform: "tistory" | "naver" };

  if (!youtubeUrl) {
    return NextResponse.json({ error: "YouTube URL을 입력해주세요." }, { status: 400 });
  }

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    return NextResponse.json({ error: "올바른 YouTube URL이 아닙니다." }, { status: 400 });
  }

  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1. 영상 정보 가져오기
  let videoInfo: { title: string; author_name: string; thumbnail_url: string };
  try {
    videoInfo = await fetchVideoInfo(videoId);
  } catch {
    return NextResponse.json({ error: "영상 정보를 가져올 수 없습니다. URL을 확인해주세요." }, { status: 400 });
  }

  // 2. Gemini로 블로그 생성
  const prompt = buildPrompt(videoInfo, platform, fullUrl);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    return NextResponse.json({ error: `Gemini API 오류: ${err}` }, { status: 500 });
  }

  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // 3. 제목/본문 파싱
  const titleMatch = text.match(/---TITLE---\s*([\s\S]*?)\s*---BODY---/);
  const bodyMatch = text.match(/---BODY---\s*([\s\S]*)/);

  const blogTitle = titleMatch?.[1]?.trim() || videoInfo.title;
  const blogBody = bodyMatch?.[1]?.trim() || text;

  return NextResponse.json({
    title: blogTitle,
    body: blogBody,
    videoInfo: {
      id: videoId,
      title: videoInfo.title,
      author: videoInfo.author_name,
      thumbnail: videoInfo.thumbnail_url,
      url: fullUrl,
    },
    platform,
  });
}
