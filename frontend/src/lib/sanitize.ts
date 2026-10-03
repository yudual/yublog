// HTML 消毒器：同构纯函数实现，允许安全标签与属性，剥离脚本/事件处理器/危险 URL。
// 用于富文本与 Markdown 输出内容与后端返回内容的渲染前过滤，防止 XSS。
// 优化说明：
// 不依赖客户端 DOMParser 与 document 环境分支，
// 服务端（SSR）与客户端运行完全一致的同构消毒逻辑，彻底根治水合不一致（Hydration Mismatch）。

import { replaceEmojiShortcodes, normalizeInlineEmoji } from "./emoji";
import { isMarkdown, markdownToHtml, enhanceCodeBlocks } from "./markdown";

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "span", "div", "mark",
  "hr",
  "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "button", "svg", "path", "line", "circle", "rect", "polygon", "input",
  "details", "summary",
]);

// 允许的全局属性（任何标签都可带）
const ALLOWED_GLOBAL_ATTRS = new Set([
  "class", "style", "title", "dir", "lang", "id", "data-code", "data-language", "data-heading-text",
]);

// 标签特定的属性白名单
const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel", "title"]),
  img: new Set(["src", "alt", "width", "height", "loading", "title"]),
  ol: new Set(["start", "type"]),
  li: new Set(["value"]),
  td: new Set(["colspan", "rowspan", "align"]),
  th: new Set(["colspan", "rowspan", "scope", "align"]),
  button: new Set(["type", "aria-label", "disabled"]),
  input: new Set(["type", "disabled", "checked"]),
  svg: new Set(["width", "height", "viewbox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "xmlns", "aria-hidden"]),
  path: new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
  line: new Set(["x1", "y1", "x2", "y2", "stroke", "stroke-width", "stroke-linecap"]),
  circle: new Set(["cx", "cy", "r", "fill", "stroke", "stroke-width"]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"]),
  polygon: new Set(["points", "fill", "stroke", "stroke-width"]),
};

const DANGEROUS_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "textarea", "select"
]);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, code: string) => {
      const parsed = code.toLowerCase().startsWith("x")
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : _;
    })
    .replace(/&(colon|semi|newline|tab|amp|lt|gt|quot|apos);/gi, (match, name: string) => {
      const entities: Record<string, string> = {
        colon: ":", semi: ";", newline: "\n", tab: "\t", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
      };
      return entities[name.toLowerCase()] || match;
    });
}

function isSafeUrl(value: string, tag: string, attrName: string): boolean {
  const decoded = decodeHtmlEntities(value);
  // Browsers normalize control characters in URL attributes before navigation.
  // Reject them here so a split scheme such as "java\nscript:" cannot pass as relative text.
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return false;
  const v = decoded.trim().toLowerCase();
  if (!v || v.startsWith("//")) return false;
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("./") || v.startsWith("../")) return true;
  const scheme = v.match(/^([a-z][a-z\d+.-]*):/i)?.[1];
  if (!scheme) return true;
  if (scheme === "http" || scheme === "https") return true;
  return tag === "a" && attrName === "href" && (scheme === "mailto" || scheme === "tel");
}

function sanitizeStyle(value: string): string {
  // 移除可能用于 XSS 或破坏布局的样式：expression()、任意 url()、position:fixed 等
  const decoded = decodeHtmlEntities(value);
  if (/expression\s*\(|@import/i.test(decoded)) return "";
  const cleaned = decoded
    .replace(/url\s*\([^)]*\)/gi, "")
    .replace(/position\s*:\s*fixed/gi, "position:static")
    .replace(/position\s*:\s*absolute/gi, "position:static");
  return cleaned;
}

/**
 * 消毒 HTML 字符串，返回仅含白名单标签/属性的安全 HTML。
 * 同构运行于 Node.js SSR 与浏览器端，输出 100% 一致，无水合差异。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  // 快速路径：完全不含 < 字符的纯文本直接返回
  if (html.indexOf("<") === -1) return html;

  // 1. 移除危险标签及其内部所有内容
  let sanitized = html.replace(
    /<(script|style|iframe|object|embed|form|textarea|select|link|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  // 处理未闭合或单闭合的危险标签
  sanitized = sanitized.replace(
    /<(script|style|iframe|object|embed|form|textarea|select|link|meta|base)\b[^>]*\/?>/gi,
    ""
  );

  // 2. 移除所有内联事件处理器 on*="..." 或 on*='...' 或 on*=...
  sanitized = sanitized.replace(/\s+on[a-z0-9_]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 3. 标签与属性过滤（同构词法解析）
  sanitized = sanitized.replace(
    /<\/?([a-z0-9_-]+)((?:\s+[^"'<>\s]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi,
    (match, rawTagName, rawAttrs, selfClosing) => {
      const tag = rawTagName.toLowerCase();
      const isClosing = match.startsWith("</");

      if (DANGEROUS_TAGS.has(tag)) return "";
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (isClosing) return `</${tag}>`;

      const allowedAttrs = ALLOWED_ATTRS_BY_TAG[tag];
      const attrRegex = /([a-z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;
      let attrMatch: RegExpExecArray | null;
      const validAttrs: string[] = [];
      let hasTargetBlank = false;
      let hasRel = false;

      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        let attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

        // 丢弃 on* 事件
        if (attrName.startsWith("on")) continue;

        // 允许 data-* 属性（用于 embed、代码快照等）
        if (attrName.startsWith("data-")) {
          validAttrs.push(`${attrName}="${attrValue.replace(/"/g, "&quot;")}"`);
          continue;
        }

        // 全局白名单属性
        if (ALLOWED_GLOBAL_ATTRS.has(attrName)) {
          if (attrName === "style") {
            const safe = sanitizeStyle(attrValue);
            if (safe) {
              validAttrs.push(`style="${safe.replace(/"/g, "&quot;")}"`);
            }
          } else {
            validAttrs.push(`${attrName}="${attrValue.replace(/"/g, "&quot;")}"`);
          }
          continue;
        }

        // 标签特定白名单属性
        if (allowedAttrs && allowedAttrs.has(attrName)) {
          if ((attrName === "href" || attrName === "src") && !isSafeUrl(attrValue, tag, attrName)) {
            continue;
          }
          if (tag === "a" && attrName === "target" && attrValue === "_blank") {
            hasTargetBlank = true;
          }
          if (tag === "a" && attrName === "rel") {
            hasRel = true;
            if (hasTargetBlank && !attrValue.includes("noopener")) {
              attrValue = "noopener noreferrer";
            }
          }
          validAttrs.push(`${attrName}="${attrValue.replace(/"/g, "&quot;")}"`);
        }
      }

      // 对 target="_blank" 的 <a> 强制补齐 rel="noopener noreferrer"
      if (tag === "a" && hasTargetBlank && !hasRel) {
        validAttrs.push('rel="noopener noreferrer"');
      }

      const attrString = validAttrs.length > 0 ? " " + validAttrs.join(" ") : "";
      const closingSlash = selfClosing || (tag === "br" || tag === "hr" || tag === "img" || tag === "input") ? " /" : "";
      return `<${tag}${attrString}${closingSlash}>`;
    }
  );

  return sanitized;
}

/**
 * 将纯文本转换为可渲染的 HTML：换行转 <br>，HTML 实体转义。
 * 用于向后兼容旧数据（发表时未使用富文本编辑器）。
 */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/**
 * 判断内容是否看起来像 HTML（包含标签），用于决定用 sanitizeHtml 还是 plainTextToHtml。
 */
export function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * 渲染入口：自动识别 Markdown 或 HTML，返回安全的美化 HTML 供 dangerouslySetInnerHTML 使用。
 */
export function renderContent(content: string): string {
  if (!content) return "";

  let html = content;
  if (isMarkdown(content)) {
    html = markdownToHtml(content);
  } else if (!looksLikeHtml(content)) {
    html = plainTextToHtml(content);
  }

  const sanitized = sanitizeHtml(html);
  const withEmoji = normalizeInlineEmoji(replaceEmojiShortcodes(sanitized));
  return enhanceCodeBlocks(withEmoji);
}
