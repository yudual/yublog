"use client";

import Image from "next/image";
import Link from "next/link";
import { BookText, ExternalLink, History, Sparkles, Rss } from "lucide-react";
import type { Post, User } from "@/lib/types";
import { resolveAvatar } from "@/lib/avatar";
import { SocialIcon, getSocialPlatform } from "@/components/SocialIcons";
import type { CSSProperties } from "react";
import { toSafeHttpUrl } from "@/lib/web-url";

export interface MomentsSiteSettings {
  siteName?: string;
  description?: string;
  socialLinks?: string;
  rssEnabled?: boolean;
  [key: string]: unknown;
}

interface LeftSidebarProps {
  owner: User;
  siteSettings?: MomentsSiteSettings | null;
  momentsCount: number;
}

export function MomentsLeftSidebar({
  owner,
  siteSettings,
  momentsCount,
}: LeftSidebarProps) {
  const avatarUrl = resolveAvatar(owner.avatar, owner.email || "", 128);
  const nickname = owner.nickname || siteSettings?.siteName || "博主";
  const bio = owner.bio || siteSettings?.description || "记录生活与思考。";

  // 解析社交链接
  let socialLinks: Array<{ type: string; url: string }> = [];
  try {
    const parsed = JSON.parse(siteSettings?.socialLinks || "[]");
    if (Array.isArray(parsed)) {
      socialLinks = parsed.filter((l: { type: string; url: string }) => l.type && l.url);
    }
  } catch {
  }

  return (
    <aside className="hidden lg:block w-56 xl:w-64 shrink-0 sticky top-24 space-y-4 self-start">
      {/* 博主个人信息卡片 */}
      <div className="overflow-hidden rounded-3xl bg-wechat-white p-5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] border border-neutral-200/60 dark:border-neutral-800/80 transition-all">
        <div className="flex flex-col items-center text-center">
          <Link
            href="/about"
            className="group relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-full ring-2 ring-emerald-500/20 dark:ring-emerald-400/20 transition-transform duration-300 hover:scale-105"
          >
            <Image
              src={avatarUrl}
              alt={nickname}
              fill
              className="object-cover"
              sizes="72px"
              unoptimized
            />
          </Link>

          <h2 className="mt-3 text-base font-bold text-neutral-900 dark:text-neutral-100">
            {nickname}
          </h2>

          <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 line-clamp-3">
            {bio}
          </p>

          {/* 动态统计微标签 */}
          <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800/80 px-3 py-1 text-[11px] text-neutral-600 dark:text-neutral-300">
            <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            <span>已记录 <strong>{momentsCount}</strong> 条碎碎念</span>
          </div>

          {/* 社交平台图标栏 */}
          {socialLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-black/[0.04] dark:border-white/[0.05] pt-3 w-full">
              {socialLinks.slice(0, 6).map((link, idx) => {
                const platform = getSocialPlatform(link.type);
                const href = link.type === "email"
                  ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(link.url.replace(/^mailto:/i, ""))
                    ? `mailto:${link.url.replace(/^mailto:/i, "")}`
                    : null)
                  : toSafeHttpUrl(link.url);
                if (!href) return null;
                return (
                  <a
                    key={idx}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={platform?.label || link.type}
                    className="social-icon-link flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800/80 transition-transform hover:scale-110"
                    style={{
                      "--social-color": platform?.color || "#576b95",
                      "--social-color-dark": platform?.darkColor || platform?.color || "#576b95",
                    } as CSSProperties}
                  >
                    <SocialIcon type={link.type} className="h-3.5 w-3.5" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 动态灵感与话题标签 */}
      <div className="overflow-hidden rounded-3xl bg-wechat-white p-5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] border border-neutral-200/60 dark:border-neutral-800/80">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            说说与动态
          </h3>
        </div>

        <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          支持图文、九宫格、实况图、短视频与背景音乐。
        </p>

        {/* 常用话题标签 */}
        <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-black/[0.04] dark:border-white/[0.05] pt-3">
          {["#日常", "#随手拍", "#随想", "#生活", "#摄影", "#岁岁念"].map((tag) => (
            <span
              key={tag}
              className="rounded-lg bg-neutral-100/90 dark:bg-neutral-800/80 px-2 py-1 text-[11px] text-neutral-600 dark:text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

interface RightSidebarProps {
  siteSettings?: MomentsSiteSettings | null;
  recentArticles: Post[];
}

export function MomentsRightSidebar({
  siteSettings,
  recentArticles,
}: RightSidebarProps) {
  const description = siteSettings?.description || "一个像微信朋友圈一样的个人博客";
  const rssEnabled = siteSettings?.rssEnabled ?? true;

  return (
    <aside className="hidden xl:block w-60 xl:w-64 shrink-0 sticky top-24 space-y-4 self-start">
      {/* 最新博文卡片 */}
      {recentArticles && recentArticles.length > 0 && (
        <div className="overflow-hidden rounded-3xl bg-wechat-white p-[1.125rem] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] border border-neutral-200/60 dark:border-neutral-800/80">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              <BookText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              最新博文
            </h3>
            <Link
              href="/articles"
              className="text-[11px] text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              全部 →
            </Link>
          </div>

          <div className="space-y-2">
            {recentArticles.slice(0, 4).map((art) => {
              const url = `/articles/${art.shortId || art.id}`;
              return (
                <Link
                  key={art.id}
                  href={url}
                  className="group block rounded-xl p-2 transition-colors hover:bg-neutral-100/80 dark:hover:bg-neutral-800/50"
                >
                  <p className="line-clamp-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
                    {art.title || "无标题文章"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
                    {art.category && (
                      <span className="rounded bg-neutral-200/60 dark:bg-neutral-700/60 px-1 py-[0.125rem]">
                        {art.category}
                      </span>
                    )}
                    <span>
                      {new Date(art.createdAt).toLocaleDateString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 站点与归档信息 */}
      <div className="overflow-hidden rounded-3xl bg-wechat-white p-[1.125rem] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] border border-neutral-200/60 dark:border-neutral-800/80">
        <h3 className="mb-2 px-1 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
          站点信息
        </h3>
        <p className="px-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>

        <div className="mt-4 space-y-1.5 border-t border-black/[0.04] dark:border-white/[0.05] pt-3">
          <Link
            href="/archives"
            className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-neutral-400" />
              时光机 · 历史动态
            </span>
            <span className="text-[11px] text-neutral-400">→</span>
          </Link>

          {rssEnabled && (
            <a
              href="/feed"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Rss className="h-3.5 w-3.5 text-amber-500" />
                RSS 订阅源
              </span>
              <ExternalLink className="h-3 w-3 text-neutral-400" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
