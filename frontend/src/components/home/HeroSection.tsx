"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import type { User } from "@/lib/types";
import { resolveAvatar } from "@/lib/avatar";
import { SocialIcon, getSocialPlatform } from "@/components/SocialIcons";
import { toSafeHttpUrl } from "@/lib/web-url";

export interface HeroSiteSettings {
  siteName?: string;
  description?: string;
  socialLinks?: string;
  backgroundImages?: string | string[];
  [key: string]: unknown;
}

interface HeroSectionProps {
  owner: User;
  siteSettings?: HeroSiteSettings | null;
  postsCount?: number;
}

export default function HeroSection({ owner, siteSettings, postsCount }: HeroSectionProps) {
  const avatarUrl = resolveAvatar(owner.avatar, owner.email || "", 256);
  const nickname = owner.nickname || siteSettings?.siteName || "Dual";
  const bio = owner.bio || siteSettings?.description || "记录生活与思考。";

  // 社交平台链接解析
  const HERO_ALLOWED_PLATFORMS = useMemo(() => ["email", "github", "douyin"], []);

  const allSocialLinks = useMemo(() => {
    let list: { type: string; url: string }[] = [];
    try {
      const parsed = JSON.parse(siteSettings?.socialLinks || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed.filter((l: { type: string; url: string }) => l.type && l.url);
      }
    } catch {}
    if (owner.email && !list.some((l) => l.type.toLowerCase() === "email")) {
      list.push({ type: "email", url: owner.email });
    }
    return list;
  }, [siteSettings, owner.email]);

  const heroSocialLinks = useMemo(() => {
    return allSocialLinks.filter((l) =>
      HERO_ALLOWED_PLATFORMS.includes(l.type.toLowerCase())
    );
  }, [allSocialLinks, HERO_ALLOWED_PLATFORMS]);

  const hasMoreSocials = useMemo(() => {
    return allSocialLinks.some(
      (l) => !HERO_ALLOWED_PLATFORMS.includes(l.type.toLowerCase())
    );
  }, [allSocialLinks, HERO_ALLOWED_PLATFORMS]);

  const [avatarSrc, setAvatarSrc] = useState(avatarUrl);
  useEffect(() => {
    setAvatarSrc(avatarUrl);
  }, [avatarUrl]);

  const scrollToMoments = () => {
    const el = document.getElementById("moments-section");
    if (el) {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    } else {
      window.scrollTo({
        top: Math.max(0, window.innerHeight - 80),
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="relative flex min-h-[70vh] sm:min-h-[74vh] lg:min-h-[78vh] w-full flex-col items-center justify-between overflow-hidden px-4 sm:px-8 pt-20 sm:pt-28 pb-10 transition-colors select-none">
      {/* 极淡雅的中央星核微温晕 (Ethereal Core Glow) */}
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[340px] w-[340px] sm:h-[480px] sm:w-[480px] rounded-full bg-gradient-to-tr from-amber-300/[0.10] via-rose-300/[0.07] to-indigo-300/[0.07] dark:from-amber-400/[0.12] dark:via-purple-500/[0.10] dark:to-cyan-400/[0.08] blur-[130px] animate-hero-glow"
        aria-hidden="true"
      />

      {/* ================= 居中核心内容区 ================= */}
      <div className="relative z-10 my-auto flex flex-col items-center text-center max-w-2xl mx-auto w-full pt-4">
        {/* ============ 巨幕建筑级空灵字母浮水印 (Architectural Cosmic Watermark "YU") ============ */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 select-none opacity-90 dark:opacity-85"
          aria-hidden="true"
        >
          <span className="font-sans font-black text-[160px] sm:text-[230px] md:text-[290px] tracking-[0.24em] leading-none bg-gradient-to-b from-neutral-900/[0.07] via-amber-500/[0.065] to-transparent dark:from-white/[0.10] dark:via-amber-400/[0.08] dark:to-transparent bg-clip-text text-transparent pl-8 sm:pl-12">
            YU
          </span>
        </div>

        {/* ============ 头像展示：柔和极光微晕 + 发丝精细渐变细环 ============ */}
        <div className="group relative mb-5 z-10">
          {/* 柔光多色极光弥散晕 */}
          <div className="absolute -inset-3 sm:-inset-3.5 rounded-full bg-gradient-to-tr from-amber-300/20 via-rose-300/15 to-indigo-300/15 dark:from-amber-400/20 dark:via-purple-500/16 dark:to-cyan-400/16 blur-lg opacity-75 group-hover:opacity-95 group-hover:scale-105 transition-all duration-700" />

          {/* 发丝级渐变细边框环 (1.5px Hairline Chromatic Rim) */}
          <div className="relative p-[1.5px] rounded-full bg-gradient-to-tr from-amber-300/60 via-rose-300/50 to-indigo-300/50 dark:from-amber-400/60 dark:via-purple-400/50 dark:to-cyan-400/50 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.12)] dark:shadow-[0_8px_24px_-6px_rgba(168,85,247,0.18)]">
            <div className="relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full ring-2 ring-white/95 dark:ring-neutral-900 bg-neutral-100 dark:bg-neutral-800">
              <Image
                src={avatarSrc}
                alt={nickname}
                fill
                sizes="(max-width: 640px) 96px, 112px"
                priority
                unoptimized
                onError={() => setAvatarSrc("/default-avatar.jpg")}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-106"
              />
            </div>
          </div>
        </div>

        {/* 优雅克制的“YU”标识表达 (Clean Brand Monogram Pill) */}
        <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-neutral-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-neutral-900/70 px-3.5 py-1 text-[11px] font-mono backdrop-blur-md shadow-xs">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="tracking-[0.2em] text-neutral-800 dark:text-neutral-200 uppercase font-semibold">
            YU · 予
          </span>
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            YuBlog
          </span>
        </div>

        {/* 标题：纯净字距排印 */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-[0.16em] sm:tracking-[0.22em] text-neutral-900 dark:text-neutral-100 transition-colors uppercase">
          {nickname}
        </h1>

        {/* 诗意斜体引言/副标 */}
        <p className="mt-3 text-base sm:text-lg text-neutral-600 dark:text-neutral-300 font-serif italic tracking-wide leading-relaxed max-w-lg transition-colors">
          &ldquo;{bio}&rdquo;
        </p>

        {/* 快速导航与探索按钮 */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={scrollToMoments}
            type="button"
            className="group flex items-center gap-2 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-5 py-2.5 text-xs sm:text-sm font-medium tracking-wide shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <span>浏览随笔</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
          </button>
          <Link
            href="/articles"
            className="flex items-center gap-1.5 rounded-full border border-neutral-300/80 dark:border-neutral-800 bg-white/75 dark:bg-neutral-900/75 px-4 py-2.5 text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 backdrop-blur-md hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
          >
            <span>深度文章</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400" />
          </Link>
          <Link
            href="/projects"
            className="flex items-center gap-1.5 rounded-full border border-neutral-300/80 dark:border-neutral-800 bg-white/75 dark:bg-neutral-900/75 px-4 py-2.5 text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 backdrop-blur-md hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
          >
            <span>开源项目</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400" />
          </Link>
        </div>

        {/* 社交平台极简微标 */}
        {heroSocialLinks.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {heroSocialLinks.map((link: { type: string; url: string }, idx: number) => {
              const platform = getSocialPlatform(link.type);
              const isEmail = link.type.toLowerCase() === "email";
              const emailValue = link.url.replace(/^mailto:/i, "");
              const safeUrl = toSafeHttpUrl(link.url);
              const href = isEmail ? `mailto:${emailValue}` : safeUrl;
              if (!href) return null;
              return (
                <a
                  key={idx}
                  href={href}
                  target={isEmail ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  className="group flex items-center gap-1.5 rounded-full border border-neutral-300/70 dark:border-neutral-800/80 bg-white/65 dark:bg-neutral-900/65 px-3 py-1 text-xs font-mono text-neutral-600 dark:text-neutral-400 backdrop-blur-md transition-all hover:border-amber-400/80 dark:hover:border-amber-500/80 hover:text-amber-600 dark:hover:text-amber-400 active:scale-95"
                >
                  <SocialIcon
                    type={link.type}
                    className="h-3 w-3 transition-transform group-hover:scale-110"
                  />
                  <span>{platform?.label || link.type}</span>
                </a>
              );
            })}

            {hasMoreSocials && (
              <Link
                href="/about#social-links"
                className="group flex items-center gap-1 rounded-full border border-dashed border-neutral-300/80 dark:border-neutral-700 bg-white/40 dark:bg-neutral-900/40 px-3 py-1 text-xs font-mono text-neutral-500 dark:text-neutral-400 backdrop-blur-md transition-all hover:border-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                <span>MORE</span>
                <span className="text-[10px] text-neutral-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ================= 探索下滚微导引 (Subtle Scroll Prompt) ================= */}
      <div className="relative z-10 mt-6 flex flex-col items-center">
        <button
          onClick={scrollToMoments}
          type="button"
          aria-label="向下滚动浏览随笔动态"
          className="group flex flex-col items-center gap-1.5 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <div className="h-5 w-px bg-gradient-to-b from-amber-500/60 to-transparent group-hover:h-7 transition-all duration-300" />
        </button>
      </div>

      {/* ================= 纯净天体地平光弧 (Orbital Horizon Arc - 纯视觉发丝光轨，无冗余文字) ================= */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[150%] sm:w-[125%] max-w-[1920px] h-[40px] sm:h-[56px] select-none"
        aria-hidden="true"
      >
        <div className="absolute inset-x-0 bottom-0 h-full rounded-[100%_100%_0_0] border-t border-neutral-200/50 dark:border-white/[0.06] bg-gradient-to-b from-amber-400/[0.045] via-purple-500/[0.03] to-transparent dark:from-amber-300/[0.06] dark:via-purple-600/[0.035] dark:to-transparent" />
      </div>
    </section>
  );
}
