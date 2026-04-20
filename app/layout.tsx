import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "CreatorTools",
  description: "쇼츠 생성 + YouTube 번역 통합 툴",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-zinc-950 text-white antialiased min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-h-screen overflow-auto">{children}</main>
      </body>
    </html>
  );
}
