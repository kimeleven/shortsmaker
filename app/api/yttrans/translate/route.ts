import { NextRequest, NextResponse } from "next/server";

// 문장 단위로 텍스트 분할 (4500자 이하 청크)
function chunkText(text: string, maxLen = 4500): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?\n])\s*/);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length <= maxLen) {
      current = current ? current + " " + s : s;
    } else {
      if (current) chunks.push(current.trim());
      // 단일 문장이 maxLen 초과하면 강제 분할
      let rem = s;
      while (rem.length > maxLen) {
        chunks.push(rem.slice(0, maxLen));
        rem = rem.slice(maxLen);
      }
      current = rem;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// 비공식 Google Translate API (무료, 소스언어 자동감지)
async function translateGoogle(text: string, target: string): Promise<string> {
  const chunks = chunkText(text);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`Google Translate ${res.status}`);
    const data = await res.json();
    // data[0]: [[translated, original, ...], ...]
    const translated = (data[0] as string[][]).map((item) => item[0]).join("");
    parts.push(translated.trim());
  }
  return parts.join(" ");
}

// MyMemory 폴백 (소스언어 en 고정)
async function translateMyMemory(text: string, target: string): Promise<string> {
  const chunks = chunkText(text, 480);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${target}`;
    const res = await fetch(url);
    const data = await res.json();
    const t = (data?.responseData?.translatedText || "").replace("TRANSLATED.NET CACHING", "").trim();
    parts.push(t);
  }
  return parts.join(" ");
}

async function translateText(text: string, target: string): Promise<string> {
  if (!text.trim()) return "";
  try {
    return await translateGoogle(text, target);
  } catch {
    return await translateMyMemory(text, target);
  }
}

export async function POST(req: NextRequest) {
  const { title, description, target_langs } = await req.json();
  if (!target_langs?.length)
    return NextResponse.json({ error: "target_langs를 지정해주세요." }, { status: 400 });

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
