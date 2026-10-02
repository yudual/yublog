"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, UserRound, Camera } from "lucide-react";
import { markManualOverride } from "@/lib/dark-mode-override";
import { getToken } from "@/lib/api-fetch";
import { PublishModal } from "@/components/TopBar";

const NAV_ITEMS = [
  { label: "首页", href: "/" },
  { label: "文章", href: "/articles" },
  { label: "项目", href: "/projects" },
  { label: "岁岁念", href: "/moments" },
  { label: "关于", href: "/about" },
];

export default function FloatingNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
    setToken(getToken());
  }, []);

  // 后台管理页面不显示前台悬浮导航
  if (pathname.startsWith("/admin")) {
    return null;
  }

  const isDark = mounted && theme === "dark";

  const toggleTheme = () => {
    markManualOverride();
    setTheme(isDark ? "light" : "dark");
  };

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 sm:h-16 w-full border-b border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-[#121216]/75 backdrop-blur-2xl backdrop-saturate-200 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.02),0_10px_30px_-10px_rgba(0,0,0,0.04)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)]">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-3 sm:px-6 gap-2">
        {/* 左侧：Logo / 个人呼号 */}
        <Link
          href="/"
          className="flex items-center gap-2 group cursor-pointer shrink-0"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100 group-hover:opacity-80 transition-opacity">
            Dual
          </span>
        </Link>

        {/* 中间：5 个核心频道菜单 (手机端支持优雅横滑) */}
        <nav
          aria-label="主要导航"
          className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-1 px-1 sm:px-2"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative shrink-0 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm rounded-full transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium shadow-xs"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 右侧：实用功能工具区 */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* 管理员快捷发动态按钮 */}
          {mounted && token && (
            <button
              onClick={() => setShowPublish(true)}
              type="button"
              title="发一条碎碎念"
              aria-label="发布动态"
              className="flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}

          {/* 深浅色模式微切换按键 */}
          <button
            onClick={toggleTheme}
            type="button"
            aria-label="切换明暗主题"
            title={mounted ? (isDark ? "切换为亮色模式" : "切换为暗色模式") : "切换主题"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {mounted ? (
              isDark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          {/* 管理员后台入口 */}
          <div className="relative group/admin">
            <Link
              href="/admin"
              aria-label={token ? "进入管理后台" : "管理员登录"}
              title={token ? "进入管理后台" : "管理员登录"}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <UserRound className="h-4 w-4" />
            </Link>
            {/* 桌面端悬浮气泡提示 */}
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 hidden group-hover/admin:sm:block z-50 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-md dark:bg-neutral-100 dark:text-neutral-900">
              {token ? "管理后台" : "管理员登录"}
            </div>
          </div>
        </div>
      </div>

      {showPublish && token && (
        <PublishModal
          token={token}
          defaultCategory="日常"
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            setShowPublish(false);
            router.refresh();
          }}
        />
      )}
    </header>
  );
}
