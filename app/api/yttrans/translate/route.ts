import { NextRequest, NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

const LANG_NAMES: Record<string, string> = {
  ko: "Korean", ja: "Japanese", "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese", es: "Spanish", fr: "French",
  de: "German", pt: "Portuguese", ru: "Russian", ar: "Arabic",
  hi: "Hindi", th: "Thai", vi: "Vietnamese", id: "Indonesian", tr: "Turkish",
};

export async function POST(req: NextRequest) {
  const { title, description, target_langs } = await req.json();
  if (!target_langs?.length)
    return NextResponse.json({ error: "target_langs를 지정해주세요." }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 500 });

  const langList = target_langs
    .map((code: string) => `"${code}": ${LANG_NAMES[code] || code}`)
    .join(", ");

  const prompt = `You are a professional translator. Translate the YouTube video title and description below into the specified languages.
Auto-detect the source language.

Languages to translate into (code: language name):
${langList}

Title: ${title || ""}
Description: ${description || ""}

Return ONLY a valid JSON object. No markdown, no explanation. Format:
{
  "<lang_code>": { "title": "...", "description": "..." },
  ...
}`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error: ${err}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // JSON 추출 (마크다운 코드블록 제거)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini가 JSON을 반환하지 않았습니다.");

    const result = JSON.parse(match[0]);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
