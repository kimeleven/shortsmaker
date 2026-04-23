import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("yt_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  try {
    // 내 채널 + 브랜드 계정 채널 모두 조회
    const [mineRes, managedRes] = await Promise.all([
      fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&managedByMe=true&maxResults=50", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const mineData = mineRes.ok ? await mineRes.json() : { items: [] };
    const managedData = managedRes.ok ? await managedRes.json() : { items: [] };

    // 중복 제거 후 합치기
    const seen = new Set<string>();
    const channels: { id: string; title: string; thumbnail?: string }[] = [];

    for (const item of [...(mineData.items || []), ...(managedData.items || [])]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        channels.push({
          id: item.id,
          title: item.snippet?.title || item.id,
          thumbnail: item.snippet?.thumbnails?.default?.url,
        });
      }
    }

    return NextResponse.json({ channels });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
