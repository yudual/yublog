import { toast } from "./toast";
import { useShareStore } from "./share-store";

export interface ShareOptions {
  title: string;
  url: string;
  typeLabel?: string; // 例如 "系列合辑", "文章", "项目", "动态"
  summary?: string;
  cover?: string;
  author?: string;
  date?: string;
  category?: string;
  readingTime?: number;
  totalArticles?: number;
  /** 仅直接复制链接至剪贴板，不展开分享海报弹窗 (默认 false) */
  copyOnly?: boolean;
}

/**
 * 健壮计算完整绝对路径 URL
 */
export function toFullAbsoluteUrl(url: string): string {
  let fullUrl = url ? url.trim() : "";
  if (typeof window !== "undefined") {
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
      const origin = window.location.origin;
      fullUrl = `${origin}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
    }
  }
  return fullUrl;
}

/**
 * 纯净写入剪贴板
 */
export async function copyCleanUrl(url: string, label = "链接"): Promise<boolean> {
  const fullUrl = toFullAbsoluteUrl(url);
  let copied = false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(fullUrl);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied && typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = fullUrl;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      copied = false;
    }
  }

  if (copied) {
    toast.success(`${label}已复制到剪贴板`);
  } else if (typeof window !== "undefined") {
    window.prompt(`请复制${label}：`, fullUrl);
  }

  return copied;
}

/**
 * 统一健壮的高品质分享处理器
 * 默认呼出优雅的海报级多功能分享弹窗 (支持二维码/直链/Markdown/纯文本/系统原生分享)
 */
export async function sharePost(options: ShareOptions): Promise<void> {
  const {
    title,
    url,
    typeLabel = "内容",
    summary,
    cover,
    author,
    date,
    category,
    readingTime,
    totalArticles,
    copyOnly = false,
  } = options;

  if (copyOnly) {
    await copyCleanUrl(url, `${typeLabel}链接`);
    return;
  }

  // 默认唤起全局高颜值 ShareModal
  useShareStore.getState().openShare({
    title,
    url,
    typeLabel,
    summary,
    cover,
    author,
    date,
    category,
    readingTime,
    totalArticles,
  });
}

/**
 * 健壮提取 postId 或 shortId
 * 解决微信/QQ/聊天软件中因复制粘贴将中文说明、标点符号粘连在 URL 末尾导致的 404
 * 例如：/moments/gEw57qcA全库整合了... -> gEw57qcA
 */
export function extractCleanPostId(rawId: string): string {
  if (!rawId) return rawId;
  let decoded = rawId;
  try {
    decoded = decodeURIComponent(rawId).trim();
  } catch {
    decoded = rawId.trim();
  }

  // 1. 如果是标准的 UUID (36 字符 hex-dash)
  const uuidMatch = decoded.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch) {
    return uuidMatch[0];
  }

  // 2. 如果是 shortId (8 字符 base62)
  const shortIdMatch = decoded.match(/^[0-9a-zA-Z]{8}/);
  if (shortIdMatch) {
    return shortIdMatch[0];
  }

  // 3. 截断到第一个非 URL 路径字符
  const sanitized = decoded.split(/[\s，。！？、；：“”‘’（）《》【】#?]/)[0];
  return sanitized || decoded;
}
