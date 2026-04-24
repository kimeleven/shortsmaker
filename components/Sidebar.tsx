"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/", icon: "🎬", label: "ShortsGen", desc: "쇼츠 영상 생성" },
  { href: "/yttrans", icon: "🌐", label: "YTTrans", desc: "YouTube 번역" },
  { href: "/blog", icon: "📝", label: "블로그작성", desc: "음악 블로그 생성" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-16 lg:w-52 bg-zinc-900 border-r border-zinc-800 flex flex-col py-6 shrink-0">
      <div className="px-3 mb-8 hidden lg:block">
        <div className="text-lg font-bold text-white tracking-tight">CreatorTools</div>
        <div className="text-xs text-zinc-500 mt-0.5">by Eddy</div>
      </div>

      <nav className="flex flex-col gap-1 px-2">
        {MENU.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                active
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span className="text-xl shrink-0">{item.icon}</span>
              <div className="hidden lg:block min-w-0">
                <div className="text-sm font-medium leading-tight">{item.label}</div>
                <div className="text-xs text-zinc-500 group-hover:text-zinc-400 leading-tight mt-0.5">{item.desc}</div>
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
