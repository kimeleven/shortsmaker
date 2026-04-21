"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const SHORTS_W = 1080;
const SHORTS_H = 1920;
const PREVIEW_H = 560;
const PREVIEW_W = Math.round(SHORTS_W * (PREVIEW_H / SHORTS_H));

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function drawPlayerOverlay(
  ctx: CanvasRenderingContext2D,
  title: string,
  artist: string,
  currentTime: number,
  totalDuration: number
) {
  const W = SHORTS_W;
  const H = SHORTS_H;

  // Bottom gradient overlay
  const gradH = 500;
  const grad = ctx.createLinearGradient(0, H - gradH, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.4)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - gradH, W, gradH);

  // Progress bar background
  const barY = H - 80;
  const barH = 6;
  const barMargin = 60;
  const barW = W - barMargin * 2;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.roundRect(barMargin, barY, barW, barH, 3);
  ctx.fill();

  // Progress bar fill
  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;
  if (progress > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(barMargin, barY, barW * progress, barH, 3);
    ctx.fill();
  }

  // Progress dot
  const dotX = barMargin + barW * progress;
  ctx.beginPath();
  ctx.arc(dotX, barY + barH / 2, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Time labels
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(formatTime(currentTime), barMargin, barY - 16);
  ctx.textAlign = "right";
  ctx.fillText(formatTime(totalDuration), W - barMargin, barY - 16);

  // Title
  ctx.textAlign = "center";
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  const titleY = barY - 160;
  ctx.fillText(title || "제목 없음", W / 2, titleY, W - 120);

  // Artist
  ctx.font = "36px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(artist || "아티스트", W / 2, titleY + 56, W - 120);

  // Play/Pause button (circle + triangle)
  const btnY = titleY - 120;
  const btnR = 50;
  // Circle
  ctx.beginPath();
  ctx.arc(W / 2, btnY, btnR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();
  // Play triangle
  ctx.beginPath();
  ctx.moveTo(W / 2 - 16, btnY - 24);
  ctx.lineTo(W / 2 - 16, btnY + 24);
  ctx.lineTo(W / 2 + 22, btnY);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

export default function ShortsGen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);

  const [mp3File, setMp3File] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [audioDuration, setAudioDuration] = useState(0); // MP3 실제 길이
  const [customDuration, setCustomDuration] = useState<number | "">(40); // 사용자 지정 (기본 40초)
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // 실제 사용할 영상 길이: 사용자 지정 > MP3 길이
  const duration = typeof customDuration === "number" && customDuration > 0 ? customDuration : audioDuration;

  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Load FFmpeg
  useEffect(() => {
    const load = async () => {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      ffmpeg.on("log", ({ message }) => {
        if (message.includes("time=")) setStatus("인코딩 중... " + message.split("time=")[1]?.split(" ")[0]);
      });
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm", "application/wasm"),
        });
        setFfmpegLoaded(true);
      } catch {
        setStatus("FFmpeg 로드 실패 — 새로고침 후 다시 시도해주세요.");
      }
    };
    load();
  }, []);

  // Audio element setup
  useEffect(() => {
    if (!audioURL) return;
    const audio = new Audio(audioURL);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setAudioDuration(audio.duration);
    });
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [audioURL]);

  // Animation loop for live preview
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = SHORTS_W;
    canvas.height = SHORTS_H;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, SHORTS_W, SHORTS_H);

    const finish = () => {
      const ct = audioRef.current ? audioRef.current.currentTime : currentTime;
      drawPlayerOverlay(ctx, title, artist, ct, duration);
    };

    if (imageURL) {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.max(SHORTS_W / img.width, SHORTS_H / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, (SHORTS_W - sw) / 2, (SHORTS_H - sh) / 2, sw, sh);
        finish();
      };
      img.src = imageURL;
    } else {
      finish();
    }
  }, [imageURL, title, artist, currentTime, duration]);

  // Redraw on state change
  useEffect(() => { drawPreview(); }, [drawPreview]);

  // Animation frame loop while playing
  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Handle MP3 selection
  const handleMp3 = (f: File) => {
    setMp3File(f);
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioURL(URL.createObjectURL(f));
    setCurrentTime(0);
    setIsPlaying(false);

    // Auto-fill title/artist from filename
    const name = f.name.replace(/\.mp3$/i, "");
    const parts = name.split(" - ");
    if (parts.length >= 2) {
      setArtist(parts[0].trim());
      setTitle(parts.slice(1).join(" - ").trim());
    } else {
      setTitle(name);
    }
  };

  // Generate video with animated progress bar
  const generateVideo = async () => {
    if (!mp3File) { setStatus("MP3 파일을 선택해주세요."); return; }
    if (!imageFile) { setStatus("배경 이미지를 선택해주세요."); return; }
    if (!ffmpegRef.current || !ffmpegLoaded) { setStatus("FFmpeg 로딩 중..."); return; }

    setGenerating(true);
    setStatus("캔버스 렌더링 중...");

    try {
      const ffmpeg = ffmpegRef.current;

      // Draw canvas without progress bar animation (static overlay)
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = SHORTS_W;
      canvas.height = SHORTS_H;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, SHORTS_W, SHORTS_H);

      // Draw background image
      if (imageURL) {
        await new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            const scale = Math.max(SHORTS_W / img.width, SHORTS_H / img.height);
            const sw = img.width * scale;
            const sh = img.height * scale;
            ctx.drawImage(img, (SHORTS_W - sw) / 2, (SHORTS_H - sh) / 2, sw, sh);
            resolve();
          };
          img.src = imageURL;
        });
      }

      // Draw player overlay with progress at 0
      drawPlayerOverlay(ctx, title, artist, 0, duration);

      const pngBlob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));

      setStatus("파일 준비 중...");
      await ffmpeg.writeFile("bg.png", await fetchFile(pngBlob));
      await ffmpeg.writeFile("audio.mp3", await fetchFile(mp3File));

      // Use the actual audio duration for video length
      const videoDuration = duration > 0 ? duration : 30;

      // Progress bar animation via FFmpeg drawbox filter
      // Bar position matches our canvas: y=1840, x=60, width=960, height=6
      const barX = 60;
      const barY = 1840;
      const barW = 960;
      const barH = 6;
      // Animated fill: width grows from 0 to barW over videoDuration
      const filterExpr = `drawbox=x=${barX}:y=${barY}:w='${barW}*t/${videoDuration}':h=${barH}:color=white:t=fill`;

      setStatus("영상 인코딩 중...");
      await ffmpeg.exec([
        "-loop", "1", "-i", "bg.png",
        "-i", "audio.mp3",
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-t", String(videoDuration),
        "-shortest",
        "-vf", `scale=${SHORTS_W}:${SHORTS_H},${filterExpr}`,
        "output.mp4",
      ]);

      const rawData = await ffmpeg.readFile("output.mp4");
      const buffer = (rawData as Uint8Array).buffer.slice(0) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shorts.mp4";
      a.click();
      URL.revokeObjectURL(url);

      await ffmpeg.deleteFile("bg.png");
      await ffmpeg.deleteFile("audio.mp3");
      await ffmpeg.deleteFile("output.mp4");
      setStatus("✅ 다운로드 완료!");

      // Restore preview
      drawPreview();
    } catch (e) {
      setStatus("❌ 오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-6 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">ShortsGen</h1>
          <p className="text-zinc-400 mt-1 text-sm">MP3 + 배경이미지 → 뮤직 쇼츠 영상</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[315px_1fr] gap-6 items-start">
          {/* Left: Preview */}
          <div className="flex flex-col items-center gap-3 lg:sticky lg:top-4">
            <div className="text-xs text-zinc-500 uppercase tracking-widest">미리보기</div>
            <div
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
              className="rounded-xl overflow-hidden border border-zinc-800 shadow-2xl cursor-pointer"
              onClick={togglePlay}
              title={isPlaying ? "일시정지" : "재생"}
            >
              <canvas ref={canvasRef} style={{ width: PREVIEW_W, height: PREVIEW_H }} className="block" />
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>1080 × 1920</span>
              {duration > 0 && <span>• {formatTime(duration)}</span>}
            </div>

            {/* Audio playback control */}
            {audioURL && (
              <button
                onClick={togglePlay}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
              >
                {isPlaying ? "⏸ 일시정지" : "▶ 미리듣기"}
                {isPlaying && <span className="text-zinc-400">{formatTime(currentTime)}</span>}
              </button>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex flex-col gap-4">
            {/* File upload */}
            <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">파일</h2>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">🎵 MP3</label>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMp3(f); }}
                  className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer"
                />
                {mp3File && <p className="text-xs text-green-400 mt-1">✓ {mp3File.name}</p>}
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">🖼️ 배경 이미지</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setImageFile(f); setImageURL(URL.createObjectURL(f)); }}
                  className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer"
                />
                {imageFile && <p className="text-xs text-green-400 mt-1">✓ {imageFile.name}</p>}
              </div>
            </div>

            {/* Title / Artist */}
            <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">곡 정보</h2>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="곡 제목"
                  className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">아티스트</label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="아티스트명"
                  className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>

            {/* Duration */}
            <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">영상 길이</h2>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={customDuration}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomDuration(v === "" ? "" : Math.min(180, Math.max(1, Number(v))));
                  }}
                  className="w-24 bg-zinc-800 text-white text-xl font-bold rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 text-center"
                  placeholder="40"
                />
                <div className="text-sm text-zinc-400">
                  초
                  {audioDuration > 0 && (
                    <button
                      onClick={() => setCustomDuration(Math.ceil(audioDuration))}
                      className="ml-3 text-xs text-zinc-500 hover:text-white underline"
                    >
                      MP3 길이 사용 ({formatTime(audioDuration)})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Generate */}
            <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
              <button
                onClick={generateVideo}
                disabled={generating || !ffmpegLoaded}
                className="w-full py-3.5 rounded-xl font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white text-black hover:bg-zinc-200 active:scale-95"
              >
                {!ffmpegLoaded ? "FFmpeg 로딩 중..." : generating ? "생성 중..." : "🎬 영상 생성 & 다운로드"}
              </button>

              {status && (
                <div className={`text-sm px-3 py-2.5 rounded-lg ${status.startsWith("✅") ? "bg-green-900/40 text-green-400" : status.startsWith("❌") ? "bg-red-900/40 text-red-400" : "bg-zinc-800 text-zinc-300"}`}>
                  {status}
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-600 text-center pb-4">
              모든 처리는 브라우저에서 수행됩니다. 파일이 서버로 전송되지 않습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
