"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface ProfileTopBarProps {
  coverHeight?: number;
  /** 详情页无 CoverHeader，TopBar 始终不透明 */
  initialBgAlpha?: number;
  /** 背景色来源：bg = 页面背景灰，white = 卡片白（用于文章详情页等白色卡片场景） */
  surfaceColor?: "bg" | "white";
  /** 文章详情页滚动渐变：顶部透明（透出白色卡片=白），下滑渐变为灰色 */
  scrollFade?: boolean;
  /** 文章和固定功能页指定后始终返回该路径，不使用浏览器历史回退。 */
  backHref?: string;
}

export default function ProfileTopBar({ coverHeight = 300, initialBgAlpha = 0, surfaceColor = "bg", scrollFade = false, backHref }: ProfileTopBarProps) {
  const router = useRouter();
  const [bgAlpha, setBgAlpha] = useState(scrollFade ? 0 : initialBgAlpha);
  const coverHeightRef = useRef(coverHeight);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector("[data-cover-header]");
      if (el) coverHeightRef.current = el.getBoundingClientRect().height;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Scroll-based background
  // - surfaceColor="white" 且非 scrollFade：跳过滚动监听，保持白色不透明
  // - scrollFade：文章详情页，基于滚动距离渐变（顶部透明显白，下滑变灰）
  // - 默认：基于 cover avatar 位置计算 alpha
  useEffect(() => {
    if (surfaceColor === "white" && !scrollFade) return;
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (scrollFade) {
          // 0px = 透明（透出白色卡片 = 白），150px 内渐变为完全灰色
          const root = document.getElementById("scroll-root");
          const rootTop = root ? root.scrollTop : 0;
          const winTop = window.scrollY || 0;
          const top = Math.max(rootTop, winTop);
          setBgAlpha(Math.min(1, Math.max(0, top / 150)));
          return;
        }
        const avatar = document.querySelector("[data-cover-avatar]") as HTMLElement | null;
        const topbar = document.querySelector("[data-topbar]") as HTMLElement | null;
        if (avatar && topbar) {
          const avatarRect = avatar.getBoundingClientRect();
          const topbarBottom = topbar.getBoundingClientRect().bottom;
          const isMobile = window.innerWidth < 768;
          const advance = isMobile ? 150 : 0;
          const fadeStart = topbarBottom + advance;
          const fadeEnd = topbarBottom - avatarRect.height;
          if (avatarRect.top >= fadeStart) setBgAlpha(0);
          else if (avatarRect.top <= fadeEnd) setBgAlpha(1);
          else setBgAlpha(1 - (avatarRect.top - fadeEnd) / (fadeStart - fadeEnd));
        }
      });
    };
    const root = document.getElementById("scroll-root");
    window.addEventListener("scroll", onScroll, { passive: true });
    if (root) root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      if (root) root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [surfaceColor, scrollFade]);

  const handleBack = () => {
    const navigate = () => {
      if (backHref) {
        router.push(backHref);
      } else if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    };
    const el = document.getElementById("profile-content");
    if (el && !el.classList.contains("opacity-0")) {
      el.classList.remove("profile-fade-in");
      el.classList.add("profile-fade-out");
      el.addEventListener("animationend", navigate, { once: true });
    } else {
      navigate();
    }
  };

  const frosted = bgAlpha > 0.5;
  // scrollFade 模式下背景始终为浅色（白→灰），图标/按钮统一用深色
  const darkUI = scrollFade || frosted;
  const iconClass = darkUI
    ? "text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
    : "text-white hover:bg-white/20 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]";

  return (
    <>
      <header data-topbar className="fixed left-1/2 z-50 w-full max-w-[600px] -translate-x-1/2 pointer-events-none top-0 md:top-6">
        <div
          className={`pointer-events-auto ${scrollFade || surfaceColor === "bg" ? "topbar-surface" : "topbar-surface-white"} flex h-12 w-full items-center justify-between px-4 sm:px-5 md:px-6 transition-all duration-300 md:rounded-t-2xl ${
            frosted
              ? "md:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.12)] md:border md:border-wechat-border"
              : "md:border md:border-transparent"
          }`}
          style={{ "--topbar-bg-alpha": bgAlpha, "--topbar-blur": "0px" } as React.CSSProperties}
        >
          {/* Left: back button — Android-style arrow */}
          <button
            type="button"
            onClick={handleBack}
            className={`-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors sm:-ml-1.5 ${iconClass}`}
            aria-label="返回"
          >
            <ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </button>

          {/* Right: spacer */}
          <div className="flex-1 min-w-0" />
        </div>
      </header>
    </>
  );
}
