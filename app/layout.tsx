import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShortsGen — 쇼츠 영상 생성기",
  description: "MP3 + 배경이미지 + 텍스트로 쇼츠 영상을 만드세요",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-zinc-950 text-white antialiased min-h-screen">{children}</body>
    </html>
  );
}
