"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { User } from "@/lib/types";
import { resolveAvatar } from "@/lib/avatar";
import { toAbsoluteUrl, toHttps } from "@/lib/upload";
import { SocialIcon, getSocialPlatform } from "@/components/SocialIcons";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";

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
}

export default function HeroSection({ owner, siteSettings }: HeroSectionProps) {
  const avatarUrl = resolveAvatar(owner.avatar, owner.email || "", 256);
  const nickname = owner.nickname || siteSettings?.siteName || "Dual";
  const bio = owner.bio || siteSettings?.description || "记录生活与思考。";

  // 从 siteSettings.backgroundImages 或 owner.cover 解析主页封面与随机背景
  const coverUrls = useMemo(() => {
    const list: string[] = [];
    const rawBg = siteSettings?.backgroundImages;
    if (rawBg) {
      try {
        const parsed = typeof rawBg === "string" ? JSON.parse(rawBg) : rawBg;
        if (Array.isArray(parsed)) {
          for (const u of parsed) {
            if (typeof u === "string") {
              const safe = toSafeImageUrl(u);
              if (safe) list.push(safe);
            }
          }
        }
      } catch {}
    }
    if (list.length === 0 && owner.cover?.trim()) {
      const safeCover = toSafeImageUrl(owner.cover);
      if (safeCover) list.push(safeCover);
    }
    return list;
  }, [siteSettings?.backgroundImages, owner.cover]);

  const [activeCover, setActiveCover] = useState<string>(() => coverUrls[0] || "");

  useEffect(() => {
    if (coverUrls.length <= 1) {
      setActiveCover(coverUrls[0] || "");
      return;
    }
    const idx = Math.floor(Math.random() * coverUrls.length);
    setActiveCover(coverUrls[idx]);
  }, [coverUrls]);

  // 首页仅精炼展示 3 个核心平台：邮箱、GitHub、抖音
  const HERO_ALLOWED_PLATFORMS = useMemo(() => ["email", "github", "douyin"], []);

  // 解析全部社交平台链接
  const allSocialLinks = useMemo(() => {
    let list: { type: string; url: string }[] = [];
    try {
      const parsed = JSON.parse(siteSettings?.socialLinks || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed.filter((l: { type: string; url: string }) => l.type && l.url);
      }
    } catch {
      // ignore
    }
    // 默认兜底：如有 email 且未在配置中
    if (owner.email && !list.some((l) => l.type.toLowerCase() === "email")) {
      list.push({ type: "email", url: owner.email });
    }
    return list;
  }, [siteSettings, owner.email]);

  // 首页只保留核心 3 平台
  const heroSocialLinks = useMemo(() => {
    return allSocialLinks.filter((l) =>
      HERO_ALLOWED_PLATFORMS.includes(l.type.toLowerCase())
    );
  }, [allSocialLinks, HERO_ALLOWED_PLATFORMS]);

  // 是否有公众号、小红书等更多平台收录在关于页
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
      const navHeight = typeof window !== "undefined" && window.innerWidth >= 640 ? 64 : 56;
      window.scrollTo({
        top: Math.max(0, window.innerHeight - navHeight),
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="relative flex min-h-[50vh] sm:min-h-[56vh] lg:min-h-[60vh] w-full flex-col items-center justify-center overflow-hidden px-6 pt-24 sm:pt-28 pb-10 sm:pb-14">
      {/* 移动端展示封面背景；桌面端由全局壁纸 DesktopDecorations 统一定位，避免双层背景重影 */}
      {activeCover && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden md:hidden [mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={toHttps(toAbsoluteUrl(activeCover))}
            alt="Hero Background"
            className="h-full w-full object-cover opacity-25 dark:opacity-15 blur-[1.5px] scale-105 transition-opacity duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/20 to-transparent dark:from-neutral-950/50 dark:via-neutral-950/20 dark:to-transparent" />
        </div>
      )}

      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-[380px] w-[380px] sm:h-[500px] sm:w-[500px] rounded-full bg-gradient-to-tr from-sky-400/10 via-indigo-500/15 to-purple-500/10 dark:from-sky-500/10 dark:via-purple-600/15 dark:to-pink-500/10 blur-[100px] animate-hero-glow"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
        {/* 头像展示 (含微光与微妙悬浮动效) */}
        <div className="group relative mb-6">
          <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-neutral-300 to-neutral-100 dark:from-neutral-700 dark:to-neutral-800 opacity-60 blur-sm group-hover:opacity-100 transition duration-500" />
          <div className="relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full ring-2 ring-white dark:ring-neutral-800 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_-10px_rgba(255,255,255,0.08)] bg-neutral-100 dark:bg-neutral-800">
            <Image
              src={avatarSrc}
              alt={nickname}
              fill
              sizes="(max-width: 640px) 96px, 112px"
              priority
              unoptimized
              onError={() => setAvatarSrc("/default-avatar.jpg")}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>
        </div>

        {/* 名字/昵称 */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 transition-colors">
          {nickname}
        </h1>

        <p className="mt-4 text-base sm:text-lg text-neutral-500 dark:text-neutral-400 font-normal leading-relaxed max-w-xl transition-colors">
          {bio}
        </p>

        {/* 行动号召按钮 */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={scrollToMoments}
            type="button"
            className="flex items-center gap-2 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-5 py-2.5 text-sm font-medium shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <span>浏览随笔动态</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          <Link
            href="/articles"
            className="flex items-center gap-1.5 rounded-full border border-neutral-200/90 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 backdrop-blur-md hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
          >
            <span>博客文章</span>
          </Link>
          <Link
            href="/projects"
            className="flex items-center gap-1.5 rounded-full border border-neutral-200/90 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 backdrop-blur-md hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-all"
          >
            <span>项目</span>
          </Link>
        </div>

        {/* 社交平台快捷小胶囊（精炼展示：邮箱、GitHub、抖音，其余收纳至关于页） */}
        {heroSocialLinks.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
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
                  className="group flex items-center gap-2 rounded-full border border-neutral-200/80 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 backdrop-blur-md shadow-xs transition-all hover:-translate-y-0.5 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm active:translate-y-0"
                >
                  <SocialIcon
                    type={link.type}
                    className="h-3.5 w-3.5 transition-transform group-hover:scale-110"
                  />
                  <span>{platform?.label || link.type}</span>
                </a>
              );
            })}

            {/* 若还配置了公众号、小红书等更多平台，提供轻量入口引流至关于页 */}
            {hasMoreSocials && (
              <Link
                href="/about#social-links"
                className="group flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300/80 dark:border-neutral-700 bg-white/40 dark:bg-neutral-900/40 px-3 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 backdrop-blur-md shadow-xs transition-all hover:-translate-y-0.5 hover:border-neutral-400 dark:hover:border-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-200"
                title="查看公众号、小红书等更多平台"
              >
                <span>更多平台</span>
                <span className="text-[10px] text-neutral-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            )}
          </div>
        )}

        {/* 探索下滚引导 (以自然的间距承接下方动态流) */}
        <div className="mt-8 mb-2 flex justify-center">
          <button
            onClick={scrollToMoments}
            type="button"
            aria-label="向下浏览随笔动态"
            className="group flex flex-col items-center gap-1 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <span className="text-xs font-medium tracking-wide opacity-75 group-hover:opacity-100 transition-opacity">
              向下浏览 · 随笔与动态
            </span>
            <div className="animate-bounce-gentle">
              <ChevronDown className="h-4 w-4" />
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}
