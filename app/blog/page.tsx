"use client";

import { useState } from "react";

type Platform = "tistory" | "naver";

type BlogResult = {
  title: string;
  body: string;
  videoInfo: {
    id: string;
    title: string;
    author: string;
    thumbnail: string;
    url: string;
  };
  platform: Platform;
};

export default function BlogPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState<Platform | null>(null);
  const [results, setResults] = useState<{ tistory?: BlogResult; naver?: BlogResult }>({});
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Platform>("tistory");
  const [copied, setCopied] = useState(false);

  const generate = async (platform: Platform) => {
    if (!url.trim()) {
      setError("YouTube URL을 입력해주세요.");
      return;
    }
    setLoading(platform);
    setError("");

    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "생성 실패");
        return;
      }
      setResults((prev) => ({ ...prev, [platform]: data }));
      setActiveTab(platform);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(null);
    }
  };

  const generateBoth = async () => {
    if (!url.trim()) {
      setError("YouTube URL을 입력해주세요.");
      return;
    }
    setError("");
    setLoading("tistory");
    setResults({});

    try {
      const [tRes, nRes] = await Promise.all([
        fetch("/api/blog/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: url, platform: "tistory" }),
        }),
        fetch("/api/blog/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: url, platform: "naver" }),
        }),
      ]);

      const tData = await tRes.json();
      const nData = await nRes.json();

      if (tRes.ok) setResults((prev) => ({ ...prev, tistory: tData }));
      if (nRes.ok) setResults((prev) => ({ ...prev, naver: nData }));
      if (!tRes.ok && !nRes.ok) setError(tData.error || nData.error || "생성 실패");
      setActiveTab("tistory");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const current = results[activeTab];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 pt-2">
          <h1 className="text-2xl font-bold">블로그작성</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            YouTube 음악 영상 → 티스토리/네이버 블로그 자동 생성
          </p>
        </div>

        {/* Input */}
        <div className="bg-zinc-900 rounded-xl p-5 mb-4">
          <label className="text-xs text-zinc-400 block mb-2">YouTube 음악 영상 URL</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... 또는 영상 ID"
              className="flex-1 bg-zinc-800 text-white rounded-lg px-4 py-3 border border-zinc-700 focus:outline-none focus:border-zinc-500 text-sm"
            />
            <button
              onClick={generateBoth}
              disabled={loading !== null}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 whitespace-nowrap"
            >
              {loading ? "생성 중..." : "블로그 생성"}
            </button>
          </div>

          {/* Individual platform buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => generate("tistory")}
              disabled={loading !== null}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/30 disabled:opacity-50 transition-colors"
            >
              {loading === "tistory" ? "생성 중..." : "티스토리만 생성"}
            </button>
            <button
              onClick={() => generate("naver")}
              disabled={loading !== null}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600/30 disabled:opacity-50 transition-colors"
            >
              {loading === "naver" ? "생성 중..." : "네이버만 생성"}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm px-4 py-2.5 rounded-lg mb-4 bg-red-900/40 text-red-400">
            {error}
          </div>
        )}

        {/* Video info */}
        {current?.videoInfo && (
          <div className="bg-zinc-900 rounded-xl p-4 mb-4 flex gap-4 items-center">
            <img
              src={current.videoInfo.thumbnail}
              alt=""
              className="w-32 h-20 object-cover rounded-lg"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{current.videoInfo.title}</div>
              <div className="text-xs text-zinc-400 mt-1">{current.videoInfo.author}</div>
              <a
                href={current.videoInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline mt-1 inline-block"
              >
                YouTube에서 보기
              </a>
            </div>
          </div>
        )}

        {/* Results tabs */}
        {(results.tistory || results.naver) && (
          <>
            <div className="flex gap-1 mb-4">
              {results.tistory && (
                <button
                  onClick={() => setActiveTab("tistory")}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                    activeTab === "tistory"
                      ? "bg-zinc-800 text-orange-400 border-b-2 border-orange-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  티스토리
                </button>
              )}
              {results.naver && (
                <button
                  onClick={() => setActiveTab("naver")}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                    activeTab === "naver"
                      ? "bg-zinc-800 text-green-400 border-b-2 border-green-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  네이버블로그
                </button>
              )}
            </div>

            {current && (
              <div className="bg-zinc-900 rounded-xl overflow-hidden">
                {/* Title */}
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">블로그 제목</div>
                    <div className="text-lg font-bold">{current.title}</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${current.title}\n\n${current.body}`)}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 transition-colors whitespace-nowrap"
                  >
                    {copied ? "복사됨!" : "전체 복사"}
                  </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-zinc-500">블로그 본문</div>
                    <button
                      onClick={() => copyToClipboard(current.body)}
                      className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      본문만 복사
                    </button>
                  </div>
                  {activeTab === "tistory" ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed blog-preview"
                      dangerouslySetInnerHTML={{ __html: current.body }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">
                      {current.body}
                    </pre>
                  )}
                </div>

                {/* Raw text toggle */}
                <details className="px-5 py-3 border-t border-zinc-800">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                    원본 텍스트 보기 (복사용)
                  </summary>
                  <pre className="mt-3 p-4 bg-zinc-800 rounded-lg text-xs text-zinc-400 whitespace-pre-wrap overflow-auto max-h-96">
                    {current.body}
                  </pre>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
