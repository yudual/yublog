"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import {
  X,
  Copy,
  Check,
  QrCode,
  Share2,
  FileText,
  Code,
  Sparkles,
  Download,
  Smartphone,
  ExternalLink,
} from "lucide-react";
import { useShareStore } from "@/lib/share-store";
import { toast } from "@/lib/toast";

export default function ShareModal() {
  const { isOpen, data, closeShare } = useShareStore();
  const [activeTab, setActiveTab] = useState<"link" | "qrcode">("link");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedCardText, setCopiedCardText] = useState(false);

  // 计算规范化完整链接
  const fullUrl = useMemo(() => {
    if (!data?.url) return "";
    let u = data.url.trim();
    if (typeof window !== "undefined") {
      if (!u.startsWith("http://") && !u.startsWith("https://")) {
        const origin = window.location.origin;
        u = `${origin}${u.startsWith("/") ? "" : "/"}${u}`;
      }
    }
    return u;
  }, [data?.url]);

  // 生成二维码
  useEffect(() => {
    if (!fullUrl) return;
    let cancelled = false;

    QRCode.toDataURL(fullUrl, {
      width: 320,
      margin: 1.5,
      color: {
        dark: "#171717",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url: string) => {
        if (!cancelled) {
          setQrCodeDataUrl(url);
        }
      })
      .catch((err: unknown) => {
        console.error("生成二维码失败:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [fullUrl]);

  // 按键 Esc 快捷关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeShare();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeShare]);

  // 复制文本辅助函数
  const copyToClipboard = useCallback(async (text: string, label: string) => {
    let success = false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        success = false;
      }
    }
    if (!success && typeof document !== "undefined") {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        success = false;
      }
    }

    if (success) {
      toast.success(`${label}已复制到剪贴板`);
      return true;
    } else {
      toast.error("复制失败，请手动长按或全选文本复制");
      return false;
    }
  }, []);

  // 1. 复制纯净直链
  const handleCopyUrl = async () => {
    if (!fullUrl) return;
    const ok = await copyToClipboard(fullUrl, "文章直链");
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2200);
    }
  };

  // 2. 复制 Markdown 引用格式
  const handleCopyMarkdown = async () => {
    if (!data) return;
    const cleanTitle = data.title.replace(/[《》]/g, "").trim();
    const md = `[《${cleanTitle}》](${fullUrl}) - ${data.author || "Dual"}`;
    const ok = await copyToClipboard(md, "Markdown 引用");
    if (ok) {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    }
  };

  // 3. 复制分享卡片纯文本
  const handleCopyCardText = async () => {
    if (!data) return;
    const cleanTitle = data.title.replace(/[《》]/g, "").trim();
    const type = data.typeLabel || "文章";
    let text = `【YuBlog · ${type}】《${cleanTitle}》\n作者：${data.author || "Dual"}`;
    if (data.summary) {
      text += `\n导读：${data.summary.slice(0, 80).trim()}...`;
    }
    text += `\n阅读直达：${fullUrl}`;
    const ok = await copyToClipboard(text, "分享摘要文案");
    if (ok) {
      setCopiedCardText(true);
      setTimeout(() => setCopiedCardText(false), 2200);
    }
  };

  // 4. 调用移动端原生系统分享 (Web Share API)
  const handleNativeShare = async () => {
    if (!data || !fullUrl) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: data.title,
          url: fullUrl,
        });
        closeShare();
      } catch (err: unknown) {
        if (err && typeof err === "object" && "name" in err && (err as { name?: string }).name === "AbortError") {
          return;
        }
        await handleCopyUrl();
      }
    } else {
      await handleCopyUrl();
    }
  };

  // 5. 保存二维码图片到本地
  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl || !data) return;
    const link = document.createElement("a");
    link.download = `YuBlog-Share-${data.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 20)}.png`;
    link.href = qrCodeDataUrl;
    link.click();
    toast.success("二维码已保存到本地");
  };

  if (!isOpen || !data) return null;

  const typeLabel = data.typeLabel || "文章";
  const cleanTitle = data.title.replace(/^[《]|(?<=[》]).*$/g, "").replace(/[《》]/g, "").trim() || data.title;
  const isMobileShareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6"
    >
      {/* 遮罩背景 */}
      <div
        onClick={closeShare}
        className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in transition-opacity cursor-pointer"
        aria-hidden="true"
      />

      {/* 居中弹窗主体容器 */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/95 dark:bg-[#16171d]/95 backdrop-blur-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] dark:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.7)] animate-scale-in text-neutral-800 dark:text-neutral-200">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-5 sm:px-6 py-4 bg-neutral-50/70 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Share2 className="h-4 w-4" />
            </span>
            <div>
              <h3 id="share-dialog-title" className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 leading-none">
                分享此{typeLabel}
              </h3>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                生成纯净直链、扫码在手机阅读或快捷引用
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeShare}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="关闭分享窗口"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 选项卡切换: 快捷链接 / 扫码阅读 */}
        <div className="flex border-b border-black/[0.06] dark:border-white/[0.08] bg-neutral-100/50 dark:bg-neutral-900/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "link"
                ? "bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>纯净链接 & 文本</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("qrcode")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "qrcode"
                ? "bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>手机扫码 & 微信</span>
          </button>
        </div>

        {/* 弹窗核心内容区 */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 精美卡片预览 (Mini Poster Preview) */}
          <div className="relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-gradient-to-br from-neutral-50 via-white to-blue-50/30 dark:from-neutral-900/80 dark:via-neutral-900/50 dark:to-blue-950/20 p-4 shadow-xs">
            <div className="flex items-start gap-3.5">
              {data.cover ? (
                <div className="relative h-16 w-20 sm:h-18 sm:w-24 shrink-0 overflow-hidden rounded-xl border border-black/5 dark:border-white/10 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.cover}
                    alt={cleanTitle}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 sm:h-18 sm:w-18 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-amber-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Sparkles className="h-6 w-6" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                  <span className="rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-semibold">
                    {typeLabel}
                  </span>
                  {data.category && (
                    <span>· {data.category}</span>
                  )}
                  {data.author && (
                    <span>· {data.author}</span>
                  )}
                </div>

                <h4 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">
                  {cleanTitle}
                </h4>

                {data.summary && (
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {data.summary}
                  </p>
                )}
              </div>
            </div>
          </div>

          {activeTab === "link" ? (
            <div className="space-y-4">
              {/* 核心直链输入展示与一键复制 */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1.5">
                  纯净网页链接 (Clean Canonical URL)
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/60 p-1.5 pl-3.5 transition-colors focus-within:border-blue-500">
                  <span className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-300 flex-1 select-all">
                    {fullUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0 ${
                      copiedUrl
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>复制链接</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 多格式一键复制快捷操作 */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="flex items-center justify-between rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-800/80 p-3 text-left hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                    <div>
                      <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        {copiedMarkdown ? "已复制！" : "Markdown 引用"}
                      </div>
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                        [文章标题](URL) 格式
                      </div>
                    </div>
                  </div>
                  {copiedMarkdown ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-neutral-400 opacity-60 group-hover:opacity-100" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyCardText}
                  className="flex items-center justify-between rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-800/80 p-3 text-left hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                    <div>
                      <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        {copiedCardText ? "已复制！" : "纯文本摘要"}
                      </div>
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                        适合微信/Telegram 转发
                      </div>
                    </div>
                  </div>
                  {copiedCardText ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-neutral-400 opacity-60 group-hover:opacity-100" />
                  )}
                </button>
              </div>

              {/* 移动端原生分享优先按钮 */}
              {isMobileShareSupported && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 py-3 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>唤起系统原生分享面板 (Share Sheet)</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2 space-y-4">
              {/* 二维码展示区域 */}
              <div className="relative flex flex-col items-center justify-center rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white p-4 shadow-sm">
                {qrCodeDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrCodeDataUrl}
                    alt="文章二维码"
                    className="h-48 w-48 sm:h-52 sm:w-52 rounded-lg"
                  />
                ) : (
                  <div className="h-48 w-48 flex items-center justify-center text-neutral-400 text-xs">
                    正在生成二维码...
                  </div>
                )}
                <div className="mt-2 text-center">
                  <span className="text-xs font-semibold text-neutral-700">
                    手机扫一扫 · 在微信中阅读
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQrCode}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>保存二维码图片</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedUrl ? "已复制链接" : "复制链接"}</span>
                </button>
              </div>
            </div>
          )}

          {/* 社交平台直达分享通道 */}
          <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between">
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              快速直达社交平台：
            </span>
            <div className="flex items-center gap-2">
              <a
                href={`https://service.weibo.com/share/share.php?url=${encodeURIComponent(
                  fullUrl
                )}&title=${encodeURIComponent(`《${cleanTitle}》 - YuBlog`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <span>分享到微博</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>

              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
                  fullUrl
                )}&text=${encodeURIComponent(`《${cleanTitle}》`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
              >
                <span>分享到 X</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
