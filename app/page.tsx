"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import JSZip from "jszip";

const SHORTS_W = 1080;
const SHORTS_H = 1920;
const PREVIEW_H = 420;
const PREVIEW_W = Math.round(SHORTS_W * (PREVIEW_H / SHORTS_H));
const MAX_TRACKS = 20;

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// includeBar: true = 미리보기용(캔버스에 바 직접 그림), false = 영상생성용(ffmpeg가 바를 그림)
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  title: string,
  artist: string,
  progress = 0,
  includeBar = true
) {
  const W = SHORTS_W, H = SHORTS_H;
  const contentBottom = H * 0.8;

  // Gradient
  const gradH = 600;
  const grad = ctx.createLinearGradient(0, contentBottom - gradH, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.4)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, contentBottom - gradH, W, H - (contentBottom - gradH));

  const barY = Math.round(contentBottom) - 60;
  const barH = 6, barMargin = 60, barW = W - barMargin * 2;

  // Progress bar (미리보기에서만)
  if (includeBar) {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath(); ctx.roundRect(barMargin, barY, barW, barH, 3); ctx.fill();
    if (progress > 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.roundRect(barMargin, barY, barW * progress, barH, 3); ctx.fill();
    }
    const dotX = barMargin + barW * progress;
    ctx.beginPath(); ctx.arc(dotX, barY + barH / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
  }

  // Title / Artist
  ctx.textAlign = "center";
  const titleY = barY - 130;
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText(title || "제목 없음", W / 2, titleY, W - 120);
  ctx.font = "36px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(artist || "아티스트", W / 2, titleY + 56, W - 120);

  // 3 Buttons: ⏮ / ⏸(pause) / ⏭
  const btnY = titleY - 130;
  const gap = 200;
  const drawBtn = (cx: number, r: number) => {
    ctx.beginPath(); ctx.arc(cx, btnY, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2.5; ctx.stroke();
  };
  // ⏮
  const px = W / 2 - gap; drawBtn(px, 38); ctx.fillStyle = "#fff";
  ctx.fillRect(px - 18, btnY - 16, 5, 32);
  ctx.beginPath(); ctx.moveTo(px - 10, btnY); ctx.lineTo(px + 14, btnY - 18); ctx.lineTo(px + 14, btnY + 18); ctx.closePath(); ctx.fill();
  // ⏸ (center — pause, 항상 재생중 상태)
  drawBtn(W / 2, 56); ctx.fillStyle = "#fff";
  ctx.fillRect(W / 2 - 20, btnY - 26, 13, 52);
  ctx.fillRect(W / 2 + 7,  btnY - 26, 13, 52);
  // ⏭
  const nx = W / 2 + gap; drawBtn(nx, 38); ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.moveTo(nx - 14, btnY - 18); ctx.lineTo(nx - 14, btnY + 18); ctx.lineTo(nx + 10, btnY); ctx.closePath(); ctx.fill();
  ctx.fillRect(nx + 13, btnY - 16, 5, 32);
}

async function renderFrame(
  canvas: HTMLCanvasElement,
  imageURL: string | null,
  title: string,
  artist: string,
  includeBar = true
) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = SHORTS_W; canvas.height = SHORTS_H;
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, SHORTS_W, SHORTS_H);
  if (imageURL) {
    await new Promise<void>((res) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.max(SHORTS_W / img.width, SHORTS_H / img.height);
        const sw = img.width * scale, sh = img.height * scale;
        ctx.drawImage(img, (SHORTS_W - sw) / 2, (SHORTS_H - sh) / 2, sw, sh);
        res();
      };
      img.src = imageURL;
    });
  }
  drawOverlay(ctx, title, artist, 0, includeBar);
}

type TrackStatus = "idle" | "processing" | "done" | "error";
type Track = {
  mp3: File | null;
  image: File | null;
  imageURL: string | null;
  title: string;
  artist: string;
  status: TrackStatus;
  progress?: number; // 0~100, processing 중에만 사용
  error?: string;
};

const newTrack = (): Track => ({ mp3: null, image: null, imageURL: null, title: "", artist: "", status: "idle" });

const STATUS_ICON: Record<TrackStatus, string> = {
  idle: "○",
  processing: "⏳",
  done: "✅",
  error: "❌",
};

export default function ShortsGen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([newTrack()]);
  const [duration, setDuration] = useState(40);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [previewIdx, setPreviewIdx] = useState(0);

  // Load FFmpeg
  useEffect(() => {
    const load = async () => {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm", "application/wasm"),
        });
        setFfmpegLoaded(true);
      } catch {
        setGenStatus("FFmpeg 로드 실패");
      }
    };
    load();
  }, []);

  // Preview
  const drawPreview = useCallback(async () => {
    const t = tracks[previewIdx];
    if (!canvasRef.current) return;
    await renderFrame(canvasRef.current, t?.imageURL ?? null, t?.title ?? "", t?.artist ?? "");
  }, [tracks, previewIdx]);

  useEffect(() => { drawPreview(); }, [drawPreview]);

  // Track helpers
  const setTrack = (i: number, patch: Partial<Track>) =>
    setTracks((prev) => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  const addRow = () => {
    if (tracks.length < MAX_TRACKS) setTracks((p) => [...p, newTrack()]);
  };

  const removeRow = (i: number) => setTracks((p) => p.filter((_, idx) => idx !== i));

  // Bulk MP3 upload
  const handleBulkMp3 = (files: FileList) => {
    const arr = Array.from(files).slice(0, MAX_TRACKS);
    setTracks((prev) => {
      const next = [...prev];
      arr.forEach((f, i) => {
        if (i >= next.length) next.push(newTrack());
        const name = f.name.replace(/\.mp3$/i, "");
        const parts = name.split(" - ");
        const title = parts.length >= 2 ? parts.slice(1).join(" - ").trim() : name;
        const artist = parts.length >= 2 ? parts[0].trim() : "";
        next[i] = { ...next[i], mp3: f, title: next[i].title || title, artist: next[i].artist || artist };
      });
      return next;
    });
  };

  // Bulk image upload
  const handleBulkImage = (files: FileList) => {
    const arr = Array.from(files).slice(0, MAX_TRACKS);
    setTracks((prev) => {
      const next = [...prev];
      arr.forEach((f, i) => {
        if (i >= next.length) next.push(newTrack());
        const url = URL.createObjectURL(f);
        next[i] = { ...next[i], image: f, imageURL: url };
      });
      return next;
    });
  };

  // Generate all
  const generateAll = async () => {
    const valid = tracks.filter((t) => t.mp3 && t.image);
    if (!valid.length) { setGenStatus("MP3 + 이미지가 있는 트랙이 없습니다."); return; }
    if (!ffmpegRef.current || !ffmpegLoaded) { setGenStatus("FFmpeg 로딩 중..."); return; }

    setGenerating(true);
    const ffmpeg = ffmpegRef.current;
    const zip = new JSZip();
    let done = 0;

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!t.mp3 || !t.image) continue;

      setTrack(i, { status: "processing", progress: 0 });
      setPreviewIdx(i);
      setGenStatus(`처리 중 ${done + 1}/${valid.length}: ${t.title || t.mp3.name}`);

      try {
        // 오프스크린 캔버스에 배경+오버레이 렌더 (프로그레스바 제외 — ffmpeg가 담당)
        const offCanvas = document.createElement("canvas");
        await renderFrame(offCanvas, t.imageURL, t.title, t.artist, false);
        const pngBlob: Blob = await new Promise((res) => offCanvas.toBlob((b) => res(b!), "image/png"));

        await ffmpeg.writeFile("bg.png", await fetchFile(pngBlob));
        await ffmpeg.writeFile("audio.mp3", await fetchFile(t.mp3));

        const vd = duration > 0 ? duration : 30;

        // ffmpeg 진행률 콜백 (인코딩 % → 행 상태 실시간 업데이트)
        const trackIdx = i;
        const onProgress = ({ progress }: { progress: number }) => {
          const pct = Math.min(99, Math.round(progress * 100));
          setTrack(trackIdx, { progress: pct });
        };
        ffmpeg.on("progress", onProgress);

        // 프로그레스바 좌표 (drawOverlay와 동일한 계산)
        const barY = Math.round(SHORTS_H * 0.8) - 60; // 1476
        const barH = 6;
        const barMargin = 60;
        const barW = SHORTS_W - barMargin * 2; // 960
        const dotR = 10;
        const dotCY = barY + Math.floor(barH / 2); // 1479

        // 3개의 drawbox 필터:
        // 1. 회색 트랙 (정적)
        const f1 = `drawbox=x=${barMargin}:y=${barY}:w=${barW}:h=${barH}:color=white@0.2:t=fill`;
        // 2. 흰색 진행 채움 (t에 따라 너비 증가)
        const f2 = `drawbox=x=${barMargin}:y=${barY}:w=${barW}*t/${vd}:h=${barH}:color=white:t=fill`;
        // 3. 흰색 점 (t에 따라 x 이동)
        const f3 = `drawbox=x=${barMargin}+${barW}*t/${vd}-${dotR}:y=${dotCY - dotR}:w=${dotR * 2}:h=${dotR * 2}:color=white:t=fill`;

        await ffmpeg.exec([
          "-loop", "1", "-i", "bg.png",
          "-i", "audio.mp3",
          "-c:v", "libx264", "-tune", "stillimage",
          "-c:a", "aac", "-b:a", "192k",
          "-pix_fmt", "yuv420p",
          "-t", String(vd), "-shortest",
          "-vf", `scale=${SHORTS_W}:${SHORTS_H},${f1},${f2},${f3}`,
          "output.mp4",
        ]);

        ffmpeg.off("progress", onProgress);

        const rawData = await ffmpeg.readFile("output.mp4");
        const buf = (rawData as Uint8Array).buffer.slice(0) as ArrayBuffer;
        const fname = `${String(i + 1).padStart(2, "0")}_${(t.title || t.mp3.name.replace(/\.mp3$/i, "")).replace(/[^\w가-힣]/g, "_")}.mp4`;
        zip.file(fname, buf);

        await ffmpeg.deleteFile("bg.png");
        await ffmpeg.deleteFile("audio.mp3");
        await ffmpeg.deleteFile("output.mp4");

        setTrack(i, { status: "done" });
        done++;
      } catch (e) {
        setTrack(i, { status: "error", error: String(e) });
      }
    }

    // Download zip
    setGenStatus("ZIP 압축 중...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shorts_${done}개.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setGenStatus(`✅ 완료 — ${done}개 영상 다운로드`);
    setGenerating(false);
  };

  const readyCount = tracks.filter((t) => t.mp3 && t.image).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 pt-2">
          <h1 className="text-2xl font-bold">ShortsGen</h1>
          <p className="text-zinc-400 text-sm mt-0.5">최대 {MAX_TRACKS}곡 일괄 생성</p>
        </div>

        {/* Top controls */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          {/* Bulk upload */}
          <div className="bg-zinc-900 rounded-xl p-4 flex gap-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">🎵 MP3 일괄 업로드</label>
              <input
                type="file" accept="audio/mp3,audio/mpeg" multiple
                onChange={(e) => e.target.files && handleBulkMp3(e.target.files)}
                className="text-xs text-zinc-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">🖼️ 이미지 일괄 업로드</label>
              <input
                type="file" accept="image/*" multiple
                onChange={(e) => e.target.files && handleBulkImage(e.target.files)}
                className="text-xs text-zinc-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="bg-zinc-900 rounded-xl p-4 flex items-center gap-3">
            <label className="text-xs text-zinc-400">공통 길이</label>
            <input
              type="number" min={1} max={180} value={duration}
              onChange={(e) => setDuration(Math.min(180, Math.max(1, Number(e.target.value))))}
              className="w-20 bg-zinc-800 text-white text-lg font-bold rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none text-center"
            />
            <span className="text-zinc-400 text-sm">초</span>
          </div>

          {/* Generate */}
          <button
            onClick={generateAll}
            disabled={generating || !ffmpegLoaded || readyCount === 0}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {!ffmpegLoaded ? "로딩 중..." : generating ? "생성 중..." : `🎬 ${readyCount}개 생성`}
          </button>
        </div>

        {genStatus && (
          <div className={`text-sm px-4 py-2.5 rounded-lg mb-4 ${genStatus.startsWith("✅") ? "bg-green-900/40 text-green-400" : "bg-zinc-800 text-zinc-300"}`}>
            {genStatus}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
          {/* Preview */}
          <div className="flex flex-col items-center gap-2 lg:sticky lg:top-4">
            <div className="text-xs text-zinc-500 uppercase tracking-widest">미리보기 #{previewIdx + 1}</div>
            <div style={{ width: PREVIEW_W, height: PREVIEW_H }} className="rounded-xl overflow-hidden border border-zinc-800">
              <canvas ref={canvasRef} style={{ width: PREVIEW_W, height: PREVIEW_H }} className="block" />
            </div>
          </div>

          {/* Track table */}
          <div className="space-y-2">
            <div className="grid grid-cols-[24px_1fr_1fr_1.2fr_1.2fr_80px_32px] gap-2 px-2 text-xs text-zinc-500 uppercase tracking-widest">
              <span>#</span><span>MP3</span><span>이미지</span><span>제목</span><span>아티스트</span><span>상태</span><span />
            </div>

            {tracks.map((t, i) => (
              <div
                key={i}
                onClick={() => setPreviewIdx(i)}
                className={`grid grid-cols-[24px_1fr_1fr_1.2fr_1.2fr_80px_32px] gap-2 items-center bg-zinc-900 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${previewIdx === i ? "ring-1 ring-zinc-500" : "hover:bg-zinc-800"}`}
              >
                <span className="text-xs text-zinc-500 font-mono">{i + 1}</span>

                {/* MP3 */}
                <label className="cursor-pointer min-w-0">
                  <input type="file" accept="audio/mp3,audio/mpeg" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const name = f.name.replace(/\.mp3$/i, "");
                      const parts = name.split(" - ");
                      setTrack(i, {
                        mp3: f,
                        title: t.title || (parts.length >= 2 ? parts.slice(1).join(" - ").trim() : name),
                        artist: t.artist || (parts.length >= 2 ? parts[0].trim() : ""),
                        status: "idle",
                      });
                    }}
                  />
                  <div className={`text-xs truncate px-2 py-1.5 rounded-lg border ${t.mp3 ? "border-green-700 text-green-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>
                    {t.mp3 ? t.mp3.name.replace(/\.mp3$/i, "") : "클릭하여 선택"}
                  </div>
                </label>

                {/* Image */}
                <label className="cursor-pointer min-w-0">
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const url = URL.createObjectURL(f);
                      setTrack(i, { image: f, imageURL: url, status: "idle" });
                    }}
                  />
                  <div className={`text-xs truncate px-2 py-1.5 rounded-lg border ${t.image ? "border-green-700 text-green-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>
                    {t.image ? t.image.name : "클릭하여 선택"}
                  </div>
                </label>

                {/* Title */}
                <input
                  value={t.title}
                  onChange={(e) => setTrack(i, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="제목"
                  className="text-xs bg-zinc-800 text-white rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500 min-w-0"
                />

                {/* Artist */}
                <input
                  value={t.artist}
                  onChange={(e) => setTrack(i, { artist: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="아티스트"
                  className="text-xs bg-zinc-800 text-white rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500 min-w-0"
                />

                {/* Status */}
                {t.status === "processing" ? (
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="text-xs text-yellow-400 text-center font-mono">{t.progress ?? 0}%</div>
                    <div className="w-full bg-zinc-700 rounded-full h-1.5">
                      <div
                        className="bg-yellow-400 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${t.progress ?? 0}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className={`text-xs text-center ${t.status === "done" ? "text-green-400" : t.status === "error" ? "text-red-400" : "text-zinc-500"}`}>
                    {STATUS_ICON[t.status]} {t.status === "idle" && t.mp3 && t.image ? "준비" : t.status === "idle" ? "대기" : t.status}
                  </div>
                )}

                {/* Remove */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeRow(i); }}
                  className="text-zinc-600 hover:text-red-400 text-lg leading-none transition-colors"
                  disabled={tracks.length === 1}
                >×</button>
              </div>
            ))}

            {tracks.length < MAX_TRACKS && (
              <button
                onClick={addRow}
                className="w-full py-2 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 text-sm transition-colors"
              >
                + 행 추가 ({tracks.length}/{MAX_TRACKS})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
