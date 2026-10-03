"use client";

import { useEffect, useMemo } from "react";
import { useSiteSettings } from "@/lib/site-settings-store";
import { toSafeHttpUrl } from "@/lib/web-url";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * 全局底部：版权与备案信息。
 * footerHtml 按 <br> 分隔：第一行为版权行，其余合并为备案/附注行；单行时不分行。
 */
export default function Footer({ className = "" }: { className?: string } = {}) {
  const beian = useSiteSettings((s) => s.beian);
  const beianUrl = useSiteSettings((s) => s.beianUrl);
  const footerHtml = useSiteSettings((s) => s.footerHtml);
  const loaded = useSiteSettings((s) => s.loaded);
  const fetchSettings = useSiteSettings((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const href = toSafeHttpUrl(beianUrl) || "https://beian.miit.gov.cn";

  // 解析 footerHtml 中的多行内容（如果用户显式写了 <br>，则分为版权行和备案/附注行）
  const { line1, line2, isMultiLine } = useMemo(() => {
    if (!footerHtml) return { line1: "", line2: "", isMultiLine: false };
    const safeHtml = sanitizeHtml(footerHtml);
    const parts = safeHtml.split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return { line1: parts[0], line2: parts.slice(1).join(" "), isMultiLine: true };
    }
    return { line1: safeHtml, line2: "", isMultiLine: false };
  }, [footerHtml]);

  if (!loaded || (!footerHtml && !beian)) return null;

  return (
    <footer className={`w-full py-6 mt-auto text-center text-xs text-neutral-400 dark:text-neutral-500 select-none ${className}`}>
      <div className="mx-auto flex flex-col items-center justify-center gap-y-1.5 px-4 leading-relaxed">
        {isMultiLine ? (
          <>
            {/* 行 1：版权声明 / 感谢开源 */}
            {line1 && (
              <div
                className="footer-html flex flex-wrap items-center justify-center gap-x-1.5 [&_a]:text-neutral-500 hover:[&_a]:text-neutral-700 dark:[&_a]:text-neutral-400 dark:hover:[&_a]:text-neutral-200 transition-colors"
                dangerouslySetInnerHTML={{ __html: line1 }}
              />
            )}
            {/* 行 2：备案信息（公安备案 + 工信部 ICP 备案平铺居中） */}
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 [&_a]:text-neutral-500 hover:[&_a]:text-neutral-700 dark:[&_a]:text-neutral-400 dark:hover:[&_a]:text-neutral-200 transition-colors [&_a]:whitespace-nowrap [&_img]:inline-block [&_img]:h-4 [&_img]:w-4 [&_img]:object-contain [&_img]:align-sub [&_img]:mr-1">
              {line2 && (
                <div
                  className="footer-html inline-flex items-center"
                  dangerouslySetInnerHTML={{ __html: line2 }}
                />
              )}
              {line2 && beian && (
                <span className="text-neutral-300 dark:text-neutral-600 select-none">·</span>
              )}
              {beian && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors whitespace-nowrap"
                >
                  {beian}
                </a>
              )}
            </div>
          </>
        ) : (
          /* 单行平铺展示 */
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 leading-relaxed [&_a]:text-neutral-500 hover:[&_a]:text-neutral-700 dark:[&_a]:text-neutral-400 dark:hover:[&_a]:text-neutral-200 transition-colors [&_a]:whitespace-nowrap [&_img]:inline-block [&_img]:h-4 [&_img]:w-4 [&_img]:object-contain [&_img]:align-sub [&_img]:mr-1">
            {line1 && (
              <div
                className="footer-html inline-flex items-center"
                dangerouslySetInnerHTML={{ __html: line1 }}
              />
            )}
            {line1 && beian && (
              <span className="text-neutral-300 dark:text-neutral-600 select-none">·</span>
            )}
            {beian && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors whitespace-nowrap"
              >
                {beian}
              </a>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
