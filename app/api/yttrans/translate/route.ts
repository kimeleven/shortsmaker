import { NextRequest, NextResponse } from "next/server";

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

async function translateChunk(text: string, target: string): Promise<string> {
  const res = await fetch(`${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=en|${target}`, { next: { revalidate: 0 } });
  const data = await res.json();
  return (data?.responseData?.translatedText || "").replace("TRANSLATED.NET CACHING", "").trim();
}

async function translateText(text: string, target: string): Promise<string> {
  if (!text.trim()) return "";
  // Split into 500-char chunks (MyMemory limit)
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 490) chunks.push(text.slice(i, i + 490));
  const parts = await Promise.all(chunks.map((c) => translateChunk(c, target)));
  return parts.join(" ");
}

export async function POST(req: NextRequest) {
  const { title, description, target_langs } = await req.json();
  if (!target_langs?.length) return NextResponse.json({ error: "target_langs를 지정해주세요." }, { status: 400 });

  const results = await Promise.all(
    target_langs.map(async (lang: string) => {
      try {
        const [t, d] = await Promise.all([
          translateText(title || "", lang),
          translateText(description || "", lang),
        ]);
        return [lang, { title: t, description: d }];
      } catch (e) {
        return [lang, { title: "", description: `[번역 실패: ${e}]` }];
      }
    })
  );

  return NextResponse.json(Object.fromEntries(results));
}
