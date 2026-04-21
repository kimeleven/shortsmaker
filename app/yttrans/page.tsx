"use client";

import { useState, useEffect, useCallback } from "react";

const LANG_GROUPS = [
  {
    region: "아시아",
    langs: [
      { code: "ko", label: "한국어" },
      { code: "ja", label: "日本語" },
      { code: "zh-CN", label: "中文(简体)" },
      { code: "yue", label: "廣東話" },
      { code: "vi", label: "Tiếng Việt" },
      { code: "ms", label: "Bahasa Melayu" },
      { code: "id", label: "Bahasa Indonesia" },
      { code: "th", label: "ภาษาไทย" },
      { code: "tl", label: "Filipino" },
      { code: "hi", label: "हिन्दी" },
      { code: "bn", label: "বাংলা" },
      { code: "fa", label: "فارسی" },
      { code: "ar", label: "العربية" },
    ],
  },
  {
    region: "유럽",
    langs: [
      { code: "en", label: "English" },
      { code: "fr", label: "Français" },
      { code: "de", label: "Deutsch" },
      { code: "it", label: "Italiano" },
      { code: "es", label: "Español" },
      { code: "pt", label: "Português" },
      { code: "ru", label: "Русский" },
      { code: "nl", label: "Nederlands" },
      { code: "pl", label: "Polski" },
      { code: "sv", label: "Svenska" },
      { code: "no", label: "Norsk" },
      { code: "da", label: "Dansk" },
      { code: "fi", label: "Suomi" },
      { code: "ro", label: "Română" },
      { code: "cs", label: "Čeština" },
      { code: "el", label: "Ελληνικά" },
      { code: "hu", label: "Magyar" },
      { code: "uk", label: "Українська" },
      { code: "sk", label: "Slovenčina" },
      { code: "hr", label: "Hrvatski" },
      { code: "ca", label: "Català" },
      { code: "is", label: "Íslenska" },
    ],
  },
  {
    region: "기타",
    langs: [
      { code: "tr", label: "Türkçe" },
      { code: "he", label: "עברית" },
      { code: "af", label: "Afrikaans" },
    ],
  },
];

const ALL_LANGS = LANG_GROUPS.flatMap((g) => g.langs);

type VideoInfo = { videoId: string; title: string; description: string; thumbnail?: string };
type TranslateResult = Record<string, { title: string; description: string }>;
type AuthStatus = { authenticated: boolean; email?: string };

export default function YTTransPage() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["ko", "ja"]);
  const [results, setResults] = useState<TranslateResult | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [transLoading, setTransLoading] = useState(false);
  const [error, setError] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [pushState, setPushState] = useState<{ status: "loading" | "ok" | "error"; message?: string } | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/yttrans/oauth/status");
      const data = await res.json();
      setAuthStatus(data);
    } catch {
      setAuthStatus({ authenticated: false });
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // auth=success or auth=error 쿼리 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "success") {
      checkAuthStatus();
      // URL 정리
      window.history.replaceState({}, "", "/yttrans");
    } else if (auth === "error") {
      setError("Google 인증에 실패했습니다. 다시 시도해주세요.");
      window.history.replaceState({}, "", "/yttrans");
    }
  }, [checkAuthStatus]);

  const fetchVideo = async () => {
    if (!url.trim()) return;
    setFetchLoading(true);
    setError("");
    setVideo(null);
    setResults(null);
    try {
      const res = await fetch("/api/yttrans/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setFetchLoading(false);
    }
  };

  const translate = async () => {
    if (!video || !selectedLangs.length) return;
    setTransLoading(true);
    setError("");
    setResults(null);
    try {
      const res = await fetch("/api/yttrans/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: video.title, description: video.description, target_langs: selectedLangs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "번역 오류");
    } finally {
      setTransLoading(false);
    }
  };

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  };

  const selectAll = () => setSelectedLangs(ALL_LANGS.map((l) => l.code));
  const clearAll = () => setSelectedLangs([]);

  const copyAll = (lang: string) => {
    if (!results?.[lang]) return;
    const { title, description } = results[lang];
    navigator.clipboard.writeText(`${title}\n\n${description}`);
  };

  const handleLogin = () => {
    window.location.href = "/api/yttrans/oauth/authorize";
  };

  const handleLogout = async () => {
    await fetch("/api/yttrans/oauth/logout", { method: "POST" });
    setAuthStatus({ authenticated: false });
  };

  const pushAllToYouTube = async () => {
    if (!video || !results) return;
    setPushState({ status: "loading" });

    try {
      const res = await fetch("/api/yttrans/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: video.videoId,
          translations: results,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setAuthStatus({ authenticated: false });
          setPushState({ status: "error", message: "인증 만료. 다시 로그인하세요." });
        } else {
          setPushState({ status: "error", message: data.error || "업데이트 실패" });
        }
        return;
      }

      setPushState({ status: "ok" });
      setTimeout(() => setPushState(null), 4000);
    } catch {
      setPushState({ status: "error", message: "네트워크 오류" });
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">YTTrans</h1>
          <p className="text-zinc-400 mt-1 text-sm">YouTube 영상 제목·설명을 다국어로 번역합니다</p>
        </div>

        {/* URL 입력 */}
        <div className="bg-zinc-900 rounded-xl p-4 space-y-3 mb-4">
          <label className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">YouTube URL</label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
              placeholder="https://youtu.be/..."
              className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-2.5 border border-zinc-700 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={fetchVideo}
              disabled={fetchLoading || !url.trim()}
              className="px-4 py-2.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {fetchLoading ? "로딩..." : "가져오기"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {/* 영상 정보 */}
        {video && (
          <div className="bg-zinc-900 rounded-xl p-4 mb-4">
            <div className="flex gap-4">
              {video.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.thumbnail} alt="" className="w-32 h-20 object-cover rounded-lg shrink-0" crossOrigin="anonymous" />
              )}
              <div className="min-w-0">
                <div className="font-semibold text-sm leading-tight mb-2">{video.title}</div>
                <div className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-line">{video.description}</div>
              </div>
            </div>
          </div>
        )}

        {/* 언어 선택 */}
        {video && (
          <div className="bg-zinc-900 rounded-xl p-4 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">번역 언어 선택</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-700 transition-colors">전체</button>
                <button onClick={clearAll} className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-700 transition-colors">해제</button>
              </div>
            </div>
            {LANG_GROUPS.map((group) => (
              <div key={group.region}>
                <div className="text-xs text-zinc-600 mb-1.5">{group.region}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.langs.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => toggleLang(lang.code)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        selectedLangs.includes(lang.code)
                          ? "bg-white text-black"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={translate}
              disabled={transLoading || !selectedLangs.length}
              className="w-full py-3 rounded-lg bg-white text-black font-bold text-sm hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {transLoading ? `번역 중... (${selectedLangs.length}개 언어)` : `🌐 번역 시작 (${selectedLangs.length}개 언어)`}
            </button>
          </div>
        )}

        {/* 번역 결과 */}
        {results && (
          <div className="space-y-3">
            <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">번역 결과</div>

            {/* YouTube 일괄 적용 배너 */}
            {authStatus !== null && (
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                {!authStatus.authenticated ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-zinc-300 font-medium">번역된 {selectedLangs.length}개 언어를 YouTube에 한 번에 적용할 수 있습니다.</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Google 계정으로 인증하면 영상 다국어 제목·설명을 일괄 등록합니다.</p>
                    </div>
                    <button
                      onClick={handleLogin}
                      className="shrink-0 px-4 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-all whitespace-nowrap"
                    >
                      Google 계정으로 인증
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-green-400 text-sm">✓</span>
                        <span className="text-sm text-zinc-300">
                          {authStatus.email ? (
                            <span>인증됨 <span className="text-zinc-500 text-xs">({authStatus.email})</span></span>
                          ) : "인증됨"}
                        </span>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="text-xs text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        로그아웃
                      </button>
                    </div>
                    <button
                      onClick={pushAllToYouTube}
                      disabled={pushState?.status === "loading"}
                      className="w-full py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {pushState?.status === "loading"
                        ? `YouTube에 적용 중... (${selectedLangs.length}개 언어)`
                        : `▶ ${selectedLangs.length}개 언어 YouTube에 일괄 적용`}
                    </button>
                    {pushState?.status === "ok" && (
                      <div className="text-xs text-green-400 bg-green-900/20 px-3 py-2 rounded-lg text-center">
                        ✓ {selectedLangs.length}개 언어 YouTube 업데이트 완료
                      </div>
                    )}
                    {pushState?.status === "error" && (
                      <div className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg text-center">
                        {pushState.message || "업데이트 실패"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedLangs.map((lang) => {
              const r = results[lang];
              if (!r) return null;
              const langLabel = ALL_LANGS.find((l) => l.code === lang)?.label || lang;

              return (
                <div key={lang} className="bg-zinc-900 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300">{langLabel}</span>
                    <button
                      onClick={() => copyAll(lang)}
                      className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-700"
                    >
                      복사
                    </button>
                  </div>
                  <div className="text-sm font-medium text-white">{r.title}</div>
                  <div className="text-xs text-zinc-400 whitespace-pre-line max-h-32 overflow-y-auto">{r.description}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
