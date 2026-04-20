import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  const match = url?.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (!match) return NextResponse.json({ error: "유효하지 않은 YouTube URL입니다." }, { status: 400 });

  const videoId = match[1];
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY가 설정되지 않았습니다." }, { status: 500 });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${apiKey}`,
    { next: { revalidate: 0 } }
  );
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return NextResponse.json({ error: "영상을 찾을 수 없습니다." }, { status: 404 });

  const { title, description, thumbnails } = item.snippet;
  return NextResponse.json({
    videoId,
    title,
    description,
    thumbnail: thumbnails?.medium?.url || thumbnails?.default?.url,
  });
}
