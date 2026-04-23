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

// 1순위: Gemini API
async function translateGemini(text: string, target: string, langLabel: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 없음");
  if (!text.trim()) return "";

  const prompt = `Translate the following text to ${langLabel}. Rules:
- Stay as faithful to the original as possible (word choice, tone, nuance, structure)
- Do NOT paraphrase, summarize, or add/remove content
- Preserve line breaks, punctuation style, and formatting
- Output only the translated text, nothing else

Text to translate:
${text}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 429: 한도 초과, 403: 키 문제 → 폴백 트리거
    throw new Error(`Gemini ${res.status}: ${err?.error?.message || ""}`);
  }

  const data = await res.json();
  const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!result) throw new Error("Gemini 응답 없음");
  return result;
}

// 2순위: 비공식 Google Translate (무료)
async function translateGoogle(text: string, target: string): Promise<string> {
  const chunks = chunkText(text);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Google Translate ${res.status}`);
    const data = await res.json();
    const translated = (data[0] as string[][]).map((item) => item[0]).join("");
    parts.push(translated.trim());
  }
  return parts.join(" ");
}

const LANG_LABELS: Record<string, string> = {
  ko: "Korean", ja: "Japanese", "zh-CN": "Simplified Chinese", yue: "Cantonese",
  vi: "Vietnamese", ms: "Malay", id: "Indonesian", th: "Thai", tl: "Filipino",
  hi: "Hindi", bn: "Bengali", fa: "Persian", ar: "Arabic",
  en: "English", fr: "French", de: "German", it: "Italian", es: "Spanish",
  pt: "Portuguese", ru: "Russian", nl: "Dutch", pl: "Polish", sv: "Swedish",
  no: "Norwegian", da: "Danish", fi: "Finnish", ro: "Romanian", cs: "Czech",
  el: "Greek", hu: "Hungarian", uk: "Ukrainian", sk: "Slovak", hr: "Croatian",
  ca: "Catalan", is: "Icelandic", tr: "Turkish", he: "Hebrew", af: "Afrikaans",
};

async function translateText(text: string, target: string): Promise<{ text: string; engine: string }> {
  if (!text.trim()) return { text: "", engine: "none" };
  const langLabel = LANG_LABELS[target] || target;

  try {
    const result = await translateGemini(text, target, langLabel);
    return { text: result, engine: "gemini" };
  } catch (e) {
    console.warn(`Gemini 실패 (${target}), Google Translate로 폴백:`, e);
    const result = await translateGoogle(text, target);
    return { text: result, engine: "google" };
  }
}

export async function POST(req: NextRequest) {
  const { title, description, target_langs } = await req.json();
  if (!target_langs?.length)
    return NextResponse.json({ error: "target_langs를 지정해주세요." }, { status: 400 });

  const engines = new Set<string>();

  const results = await Promise.all(
    target_langs.map(async (lang: string) => {
      try {
        const [t, d] = await Promise.all([
          translateText(title || "", lang),
          translateText(description || "", lang),
        ]);
        engines.add(t.engine);
        engines.add(d.engine);
        return [lang, { title: t.text, description: d.text }];
      } catch (e) {
        return [lang, { title: "", description: `[번역 실패: ${e}]` }];
      }
    })
  );

  return NextResponse.json({
    ...Object.fromEntries(results),
    _engine: engines.has("gemini") && engines.has("google")
      ? "gemini+google(폴백)"
      : engines.has("gemini") ? "gemini" : "google",
  });
}
