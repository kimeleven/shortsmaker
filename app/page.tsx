"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const FONTS = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Impact", value: "Impact, fantasy" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const SHORTS_W = 1080;
const SHORTS_H = 1920;
const PREVIEW_H = 560;
const PREVIEW_W = Math.round(SHORTS_W * (PREVIEW_H / SHORTS_H));

type TextBlock = {
  text: string;
  font: string;
  fontSize: number;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
};

type Position = "top" | "center" | "bottom";

const DEFAULT_BLOCK = (): TextBlock => ({
  text: "",
  font: FONTS[0].value,
  fontSize: 72,
  fontColor: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 4,
});

const POSITION_LABELS: Record<Position, string> = {
  top: "상단 텍스트",
  center: "중앙 텍스트",
  bottom: "하단 텍스트",
};

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  position: Position
) {
  if (!block.text.trim()) return;

  const lines = block.text.split("\n");
  ctx.font = `bold ${block.fontSize}px ${block.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = block.fontSize * 1.35;
  const totalH = lineHeight * lines.length;
  const PADDING = 120;

  let startY: number;
  if (position === "top") {
    startY = PADDING + lineHeight / 2;
  } else if (position === "bottom") {
    startY = SHORTS_H - PADDING - totalH + lineHeight / 2;
  } else {
    startY = SHORTS_H / 2 - totalH / 2 + lineHeight / 2;
  }

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    if (block.strokeWidth > 0) {
      ctx.strokeStyle = block.strokeColor;
      ctx.lineWidth = block.strokeWidth * 2;
      ctx.lineJoin = "round";
      ctx.strokeText(line, SHORTS_W / 2, y);
    }
    ctx.fillStyle = block.fontColor;
    ctx.fillText(line, SHORTS_W / 2, y);
  });
}

function TextPanel({
  position,
  block,
  onChange,
}: {
  position: Position;
  block: TextBlock;
  onChange: (b: TextBlock) => void;
}) {
  const set = <K extends keyof TextBlock>(key: K, val: TextBlock[K]) =>
    onChange({ ...block, [key]: val });

  return (
    <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${position === "top" ? "bg-blue-400" : position === "center" ? "bg-green-400" : "bg-orange-400"}`} />
        {POSITION_LABELS[position]}
      </h2>
      <textarea
        value={block.text}
        onChange={(e) => set("text", e.target.value)}
        rows={2}
        className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 resize-none"
        placeholder="텍스트 입력 (엔터 줄바꿈, 비워두면 표시 안 됨)"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">폰트</label>
          <select
            value={block.font}
            onChange={(e) => set("font", e.target.value)}
            className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">크기: {block.fontSize}px</label>
          <input
            type="range"
            min={20}
            max={200}
            value={block.fontSize}
            onChange={(e) => set("fontSize", Number(e.target.value))}
            className="w-full accent-white mt-2"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">글자색</label>
          <div className="flex items-center gap-2">
            <input type="color" value={block.fontColor} onChange={(e) => set("fontColor", e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <span className="text-xs text-zinc-500 font-mono">{block.fontColor}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">외곽선색</label>
          <div className="flex items-center gap-2">
            <input type="color" value={block.strokeColor} onChange={(e) => set("strokeColor", e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <span className="text-xs text-zinc-500 font-mono">{block.strokeColor}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">외곽선: {block.strokeWidth}</label>
          <input
            type="range" min={0} max={20} value={block.strokeWidth}
            onChange={(e) => set("strokeWidth", Number(e.target.value))}
            className="w-full accent-white mt-2"
          />
        </div>
      </div>
    </div>
  );
}

export default function ShortsGen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [topBlock, setTopBlock] = useState<TextBlock>(DEFAULT_BLOCK());
  const [centerBlock, setCenterBlock] = useState<TextBlock>({ ...DEFAULT_BLOCK(), text: "여기에 텍스트를 입력하세요" });
  const [bottomBlock, setBottomBlock] = useState<TextBlock>(DEFAULT_BLOCK());
  const [duration, setDuration] = useState(30);
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

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
      drawTextBlock(ctx, topBlock, "top");
      drawTextBlock(ctx, centerBlock, "center");
      drawTextBlock(ctx, bottomBlock, "bottom");
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
  }, [imageURL, topBlock, centerBlock, bottomBlock]);

  useEffect(() => { drawPreview(); }, [drawPreview]);

  const generateVideo = async () => {
    if (!mp3File) { setStatus("MP3 파일을 선택해주세요."); return; }
    if (!imageFile) { setStatus("배경 이미지를 선택해주세요."); return; }
    if (!ffmpegRef.current || !ffmpegLoaded) { setStatus("FFmpeg 로딩 중..."); return; }

    setGenerating(true);
    setStatus("캔버스 렌더링 중...");

    try {
      const ffmpeg = ffmpegRef.current;
      const canvas = canvasRef.current!;
      const pngBlob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));

      setStatus("파일 준비 중...");
      await ffmpeg.writeFile("bg.png", await fetchFile(pngBlob));
      await ffmpeg.writeFile("audio.mp3", await fetchFile(mp3File));

      setStatus("영상 인코딩 중...");
      await ffmpeg.exec([
        "-loop", "1", "-i", "bg.png",
        "-i", "audio.mp3",
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-t", String(duration),
        "-shortest",
        "-vf", `scale=${SHORTS_W}:${SHORTS_H}`,
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
    } catch (e) {
      setStatus("❌ 오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">ShortsGen</h1>
          <p className="text-zinc-400 mt-1 text-sm">MP3 + 배경이미지 → 쇼츠 영상 (9:16)</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[315px_1fr] gap-6 items-start">
          {/* Left: Preview */}
          <div className="flex flex-col items-center gap-3 lg:sticky lg:top-4">
            <div className="text-xs text-zinc-500 uppercase tracking-widest">미리보기</div>
            <div style={{ width: PREVIEW_W, height: PREVIEW_H }} className="rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">
              <canvas ref={canvasRef} style={{ width: PREVIEW_W, height: PREVIEW_H }} className="block" />
            </div>
            <div className="text-xs text-zinc-600">1080 × 1920 (9:16)</div>

            {/* Files + Duration + Button */}
            <div className="w-full space-y-3 mt-1">
              <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">파일</h2>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">🎵 MP3</label>
                  <input type="file" accept="audio/mp3,audio/mpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) setMp3File(f); }}
                    className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer" />
                  {mp3File && <p className="text-xs text-green-400 mt-1">✓ {mp3File.name}</p>}
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">🖼️ 배경 이미지</label>
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setImageFile(f); setImageURL(URL.createObjectURL(f)); }}
                    className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer" />
                  {imageFile && <p className="text-xs text-green-400 mt-1">✓ {imageFile.name}</p>}
                </div>
              </div>

              <div className="bg-zinc-900 rounded-xl p-4 flex items-center gap-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">영상 길이</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={180} value={duration}
                      onChange={(e) => setDuration(Math.min(180, Math.max(1, Number(e.target.value))))}
                      className="w-20 bg-zinc-800 text-white text-lg font-bold rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none text-center" />
                    <span className="text-zinc-400 text-sm">초</span>
                  </div>
                </div>
              </div>

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
          </div>

          {/* Right: Text panels */}
          <div className="flex flex-col gap-4">
            <TextPanel position="top" block={topBlock} onChange={setTopBlock} />
            <TextPanel position="center" block={centerBlock} onChange={setCenterBlock} />
            <TextPanel position="bottom" block={bottomBlock} onChange={setBottomBlock} />
            <p className="text-xs text-zinc-600 text-center pb-4">
              모든 처리는 브라우저에서 수행됩니다. 파일이 서버로 전송되지 않습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
