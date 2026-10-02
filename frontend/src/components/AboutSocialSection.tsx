"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check, QrCode, X } from "lucide-react";
import { SocialIcon, getSocialPlatform } from "@/components/SocialIcons";
import { copyToClipboard } from "@/lib/clipboard";
import { toAbsoluteUrl, toHttps } from "@/lib/upload";

export interface SocialLinkItem {
  type: string;
  url: string;
}

interface AboutSocialSectionProps {
  socialLinks: SocialLinkItem[];
}

export default function AboutSocialSection({ socialLinks }: AboutSocialSectionProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [previewQr, setPreviewQr] = useState<string | null>(null);

  if (!socialLinks || socialLinks.length === 0) {
    return null;
  }

  const handleCopy = async (text: string, idx: number) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    }
  };

  return (
    <section id="social-links" className="mt-10 scroll-mt-24">
      {/* 模块标题与指引 */}
      <div className="mb-4 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-wechat-primary dark:bg-emerald-400" />
          <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
            在各处找到我 · 社交矩阵
          </h2>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 pl-3">
          生活随笔、思考笔记与交流渠道全量收录，欢迎交流与关注
        </p>
      </div>

      {/* 社交平台卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {socialLinks.map((item, idx) => {
          const platform = getSocialPlatform(item.type);
          const label = platform?.label || item.type;
          const isEmail = item.type.toLowerCase() === "email" || (item.url.includes("@") && !item.url.startsWith("http"));
          const isWechat = item.type.toLowerCase() === "wechat";
          const isImage =
            /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(item.url) ||
            item.url.startsWith("/uploads/") ||
            item.url.includes("data:image/");
          const isHttpUrl = /^https?:\/\//i.test(item.url);

          // 显示文字摘要（截取过长 URL）
          let displayDetail = item.url;
          if (isEmail) {
            displayDetail = item.url.replace(/^mailto:/, "");
          } else if (isImage) {
            displayDetail = "点击查看 / 扫码关注";
          } else if (isHttpUrl) {
            try {
              const u = new URL(item.url);
              displayDetail = `${u.hostname}${u.pathname.length > 1 ? u.pathname : ""}`;
            } catch {
              displayDetail = item.url;
            }
          }

          // 1. 如果是图片（如公众号二维码）
          if (isImage || (isWechat && (item.url.startsWith("http") || item.url.startsWith("/")))) {
            const imgSrc = toHttps(toAbsoluteUrl(item.url));
            return (
              <div
                key={idx}
                onClick={() => setPreviewQr(imgSrc)}
                className="group relative flex items-center justify-between rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/70 dark:bg-neutral-900/50 p-3.5 shadow-xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-neutral-800 shadow-xs border border-neutral-100 dark:border-neutral-700/60"
                    style={{ color: platform?.color || "#576b95" }}
                  >
                    <SocialIcon type={item.type} className="h-5 w-5 transition-transform group-hover:scale-110" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                        {label}
                      </span>
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-normal text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                        二维码
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                      {displayDetail}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-2 text-neutral-400 dark:text-neutral-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <QrCode className="h-4 w-4" />
                </div>
              </div>
            );
          }

          // 2. 如果是普通外链（如 GitHub, 抖音, 网站等）
          if (isHttpUrl) {
            return (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-center justify-between rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/70 dark:bg-neutral-900/50 p-3.5 shadow-xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-neutral-800 shadow-xs border border-neutral-100 dark:border-neutral-700/60"
                    style={{ color: platform?.color || "#576b95" }}
                  >
                    <SocialIcon type={item.type} className="h-5 w-5 transition-transform group-hover:scale-110" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate block">
                      {label}
                    </span>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5" title={item.url}>
                      {displayDetail}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-2 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </div>
              </a>
            );
          }

          // 3. 邮箱或纯文本账号（如微信号/小红书号）支持一键复制与唤起
          const cleanVal = isEmail ? item.url.replace(/^mailto:/, "") : item.url;
          const isCopied = copiedIdx === idx;

          return (
            <div
              key={idx}
              className="group relative flex items-center justify-between rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/70 dark:bg-neutral-900/50 p-3.5 shadow-xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-neutral-800 shadow-xs border border-neutral-100 dark:border-neutral-700/60"
                  style={{ color: platform?.color || "#576b95" }}
                >
                  <SocialIcon type={item.type} className="h-5 w-5 transition-transform group-hover:scale-110" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {label}
                    </span>
                    {isEmail && (
                      <a
                        href={`mailto:${cleanVal}`}
                        className="text-[10px] text-wechat-primary dark:text-emerald-400 hover:underline"
                        title="唤起邮件客户端"
                      >
                        发送邮件 ↗
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5" title={cleanVal}>
                    {cleanVal}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(cleanVal, idx)}
                className="shrink-0 ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                title="复制账号或邮箱"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="text-[11px]">复制</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* 微信/公众号等二维码弹出模态框 */}
      {previewQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewQr(null)}
        >
          <div
            className="relative flex flex-col items-center rounded-3xl bg-white dark:bg-neutral-900 p-6 shadow-2xl max-w-xs w-full border border-neutral-200 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewQr(null)}
              className="absolute top-4 right-4 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 text-center">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                扫一扫关注
              </h3>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                使用微信或其他对应 App 扫码
              </p>
            </div>
            <div className="relative aspect-square w-52 overflow-hidden rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewQr}
                alt="社交二维码"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
