import { Marked, type Token } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import nginx from "highlight.js/lib/languages/nginx";
import ini from "highlight.js/lib/languages/ini";
import TurndownService from "turndown";
import { parseFrontmatter, stripFrontmatter } from "./frontmatter";

// 按需注册核心语言包，首屏 JS 体积削减 ~900KB
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("ini", ini);

/**
 * 跨浏览器安全剪贴板复制（支持非安全上下文 HTTP / 局域网 IP 降级回退）
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降级使用 execCommand
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * 语言别名与显示名称映射
 */
const LANGUAGE_NAMES: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  jsx: "React JSX",
  tsx: "React TSX",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  py: "Python",
  python: "Python",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Zsh",
  go: "Go",
  rust: "Rust",
  rs: "Rust",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  cs: "C#",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  markdown: "Markdown",
  md: "Markdown",
  docker: "Docker",
  dockerfile: "Dockerfile",
  xml: "XML",
  plaintext: "Text",
  text: "Text",
};

/**
 * 语言标签美化
 */
function getLanguageLabel(lang: string): string {
  const normalized = (lang || "").toLowerCase().trim();
  if (LANGUAGE_NAMES[normalized]) return LANGUAGE_NAMES[normalized];
  if (!normalized) return "Text";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  jsx: "javascript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  html: "xml",
  svg: "xml",
  yml: "yaml",
  rs: "rust",
  golang: "go",
  cs: "csharp",
  "c++": "cpp",
  c: "cpp",
  h: "cpp",
  hpp: "cpp",
  docker: "dockerfile",
  md: "markdown",
  toml: "ini",
};

/**
 * 将代码块包装为 macOS 风格结构：
 * 红黄绿圆点 + 语言标签 + 复制按钮 + 行号 + highlight.js 代码高亮
 */
export function buildMacosCodeBlock(codeText: string, lang = "plaintext"): string {
  const trimmedLang = (lang || "plaintext").trim().toLowerCase();
  const normalizedLang = LANGUAGE_ALIAS_MAP[trimmedLang] || trimmedLang;
  const validLang = hljs.getLanguage(normalizedLang) ? normalizedLang : "";

  let highlighted = "";
  try {
    if (validLang) {
      highlighted = hljs.highlight(codeText, { language: validLang, ignoreIllegals: true }).value;
    } else {
      highlighted = escapeHtml(codeText);
    }
  } catch {
    highlighted = escapeHtml(codeText);
  }

  const langLabel = getLanguageLabel(lang || (validLang || "plaintext"));

  // 计算行号
  const lineCount = codeText.split("\n").length;
  const actualLines = codeText.endsWith("\n") ? lineCount - 1 : lineCount;
  const lineNumbers = Array.from(
    { length: Math.max(1, actualLines) },
    (_, i) => i + 1
  ).join("\n");

  const escapedCodeAttr = escapeAttr(codeText);

  return `<div class="macos-enhanced-pre" data-code="${escapedCodeAttr}"><div class="macos-enhanced-header"><div class="macos-traffic-lights"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div><span class="macos-enhanced-lang">${langLabel}</span><button class="macos-enhanced-copy" type="button" aria-label="复制代码"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>复制</span></button></div><div class="macos-enhanced-body"><div class="macos-line-numbers">${lineNumbers}</div><pre class="macos-enhanced-code hljs"><code class="language-${lang || 'plaintext'}">${highlighted}</code></pre></div></div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 针对现有代码块后处理增强（向下兼容）
 */
export function enhanceCodeBlocks(html: string): string {
  if (!html || html.indexOf("<pre") === -1) return html;

  return html.replace(
    /<pre([^>]*)>([\s\S]*?)<\/pre>/gi,
    (fullMatch, preAttrs: string, inner: string) => {
      // 避免重复包装
      if (preAttrs.includes("macos-enhanced-code")) return fullMatch;

      const dataLangMatch = preAttrs.match(/data-language="([^"]*)"/i);
      const codeClassMatch = inner.match(/<code[^>]*class="[^"]*language-(\w+)[^"]*"/i);
      const lang = (dataLangMatch?.[1] || codeClassMatch?.[1] || "plaintext").trim();

      const codeMatch = inner.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      const rawInner = codeMatch?.[1] || inner;
      const codeText = rawInner
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, "");

      return buildMacosCodeBlock(codeText, lang);
    }
  );
}

/**
 * 创建高可用的 Marked 实例
 */
function createMarkedInstance() {
  let headingIndex = 0;

  const instance = new Marked({
    gfm: true,
    breaks: true,
  });

  instance.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plainText = text.replace(/<[^>]+>/g, "").trim();
        // 关键设计：目录 TOC 仅收集 h2 与 h3，保证 headingIndex 与 TOC 目录数组索引 1:1 绝对对齐
        const isTocHeading = depth === 2 || depth === 3;
        const id = isTocHeading ? `article-heading-${headingIndex++}` : undefined;
        const idAttr = id ? ` id="${id}"` : "";
        return `<h${depth}${idAttr} data-heading-text="${escapeAttr(plainText)}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        return buildMacosCodeBlock(text, lang || "plaintext");
      },
      table(token) {
        let header = "";
        let body = "";

        // 表头
        let headerRow = "";
        for (const cell of token.header) {
          const alignAttr = cell.align ? ` align="${cell.align}"` : "";
          headerRow += `<th${alignAttr}>${this.parser.parseInline(cell.tokens)}</th>`;
        }
        header = `<thead><tr>${headerRow}</tr></thead>`;

        // 表身
        for (const row of token.rows) {
          let bodyRow = "";
          for (const cell of row) {
            const alignAttr = cell.align ? ` align="${cell.align}"` : "";
            bodyRow += `<td${alignAttr}>${this.parser.parseInline(cell.tokens)}</td>`;
          }
          body += `<tr>${bodyRow}</tr>`;
        }
        body = `<tbody>${body}</tbody>`;

        return `<div class="tableWrapper"><table class="article-table">\n${header}\n${body}\n</table></div>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        const isExternal = href.startsWith("http://") || href.startsWith("https://");
        const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${escapeAttr(href)}"${titleAttr}${externalAttrs}>${text}</a>`;
      },
      image({ href, title, text }) {
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        const altAttr = text ? ` alt="${escapeAttr(text)}"` : "";
        return `<img src="${escapeAttr(href)}"${altAttr}${titleAttr} class="rounded-xl my-4 max-w-full h-auto shadow-xs" loading="lazy" />`;
      },
    },
  });

  return {
    parse: (md: string) => {
      headingIndex = 0;
      return instance.parse(md);
    },
  };
}

/**
 * 转换 Markdown 提示卡片（Callout / Admonitions）
 * 语法支持单行及跨多段落：
 * > [!NOTE] 提示
 * > [!TIP] 小技巧
 * > [!IMPORTANT] 重要
 * > [!WARNING] 警告
 * > [!CAUTION] 危险
 */
const CALLOUT_ICONS: Record<string, string> = {
  note: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  tip: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>`,
  important: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  caution: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

const CALLOUT_TITLES: Record<string, string> = {
  note: "注意 / Note",
  tip: "提示 / Tip",
  important: "重点 / Important",
  warning: "警告 / Warning",
  caution: "危险 / Caution",
};

function postProcessCallouts(html: string): string {
  if (!html.includes("[!")) return html;

  return html.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/gi,
    (fullBlock, inner: string) => {
      const calloutMatch = inner.match(
        /^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*<br\s*\/?>)?([\s\S]*?)<\/p>([\s\S]*)$/i
      );
      if (!calloutMatch) return fullBlock;

      const typeStr = calloutMatch[1];
      const firstParaRest = calloutMatch[2].trim();
      const remainingParas = calloutMatch[3].trim();
      const type = typeStr.toLowerCase();
      const icon = CALLOUT_ICONS[type] || CALLOUT_ICONS.note;
      const title = CALLOUT_TITLES[type] || typeStr;

      let bodyHtml = "";
      if (firstParaRest) {
        bodyHtml += `<p>${firstParaRest}</p>`;
      }
      if (remainingParas) {
        bodyHtml += remainingParas;
      }

      return `<div class="markdown-callout ${type}"><div class="markdown-callout-title">${icon}<span>${title}</span></div><div class="markdown-callout-body">${bodyHtml}</div></div>`;
    }
  );
}

/**
 * 判断文本是否显式包含 Markdown 标志性语法
 */
export function isMarkdown(text: string): boolean {
  if (!text) return false;
  // 检测常见 Markdown 特征：frontmatter、标题、引用、列表、任务、代码块、行内代码、粗体/斜体/删除线、链接/图片、表格、分割线、Callout
  if (/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/m.test(text)) return true;
  if (/^#{1,6}\s+/m.test(text)) return true;
  if (/^>\s+/m.test(text)) return true;
  if (/^```[a-z0-9_-]*\r?\n/mi.test(text)) return true;
  if (/^(\s*[-*+]\s+|\s*\d+\.\s+)/m.test(text)) return true;
  if (/^[-*+]\s+\[[ xX]\]/m.test(text)) return true;
  if (/`[^`\n]+`/.test(text)) return true;
  if (/\|(?:[^|\n]+\|)+/m.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/\*[^*\n]+\*/.test(text)) return true;
  if (/~~[^~\n]+~~/.test(text)) return true;
  if (/^(?:---|\*\*\*|___)\s*$/m.test(text)) return true;
  if (/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(text)) return true;
  return false;
}

/**
 * 为旧版遗留 HTML 标题补充 article-heading-N 锚点 ID
 */
export function injectLegacyHeadingIds(html: string): string {
  if (!html || !/<h[23]/i.test(html)) return html;
  let idx = 0;
  return html.replace(/<h([23])((?:(?!id=)[^>])*)>(.*?)<\/h\1>/gi, (match, level, attrs, inner) => {
    return `<h${level} id="article-heading-${idx++}"${attrs}>${inner}</h${level}>`;
  });
}

/**
 * 提取正文中的章节标题（支持 Markdown 与 legacy HTML）
 * 为移动端/桌面端目录（TOC）提供绝对一致的层级、标题与元素 id
 * 通过 Marked 词法分析器精准隔离代码块、引用与 HTML 注释，彻底防止代码块内的 # 误判为目录标题
 */
export function extractHeadings(content: string): Array<{ id: string; text: string; level: number }> {
  if (!content) return [];
  const pureContent = stripFrontmatter(content).trim();
  const items: Array<{ id: string; text: string; level: number }> = [];

  // 1. 优先使用 Marked 语法树提取 Markdown 标题 (h2, h3)，避免误匹配代码块内的文本
  try {
    const marked = new Marked({ gfm: true, breaks: true });
    const tokens = marked.lexer(pureContent);
    let idx = 0;
    const walk = (toks: Token[]) => {
      for (const t of toks) {
        if (t.type === "heading" && (t.depth === 2 || t.depth === 3)) {
          const text = (t.text || "").replace(/<[^>]+>/g, "").replace(/[*~_`]/g, "").trim();
          if (text) {
            items.push({ id: `article-heading-${idx++}`, text, level: t.depth });
          }
        }
        if ("tokens" in t && Array.isArray((t as { tokens?: Token[] }).tokens)) {
          walk((t as { tokens: Token[] }).tokens);
        }
      }
    };
    walk(tokens);
  } catch {
    // 忽略 Marked 语法树异常，走兜底
  }

  if (items.length > 0) return items;

  // 2. 回退检测 HTML 标题 (<h2...>, <h3...>)，先剔除 pre 内部代码块
  const htmlWithoutCode = pureContent.replace(/<pre[\s\S]*?<\/pre>/gi, "");
  const htmlRegex = /<h([23])[^>]*>(.*?)<\/h\1>/gi;
  let htmlMatch;
  let htmlIdx = 0;
  while ((htmlMatch = htmlRegex.exec(htmlWithoutCode)) !== null) {
    const level = parseInt(htmlMatch[1], 10);
    const text = htmlMatch[2].replace(/<[^>]+>/g, "").trim();
    if (text) {
      items.push({ id: `article-heading-${htmlIdx++}`, text, level });
    }
  }

  return items;
}

export interface MarkdownToHtmlOptions {
  /** 如果 Markdown 开头存在一级大标题且与文章标题重复，自动过滤以消除双标题 */
  stripRedundantTitle?: string;
}

/**
 * Markdown → HTML 核心转换函数
 * 1. 提取并过滤 Frontmatter
 * 2. 借助 Marked 与 highlight.js 解析 GFM/表格/高亮代码
 * 3. 增强代码块（macOS 风格容器 + 行号 + 复制）
 * 4. 增强 Callout 提示框
 * 5. 保留内联自定义嵌入（音乐/视频/豆瓣/链接卡片）
 */
export function markdownToHtml(md: string, options: MarkdownToHtmlOptions = {}): string {
  if (!md) return "";

  // 1. 过滤 Frontmatter，提取纯 Markdown 正文
  const { content } = parseFrontmatter(md);
  let rawBody = content.trim();
  if (!rawBody) return "";

  // 消除顶部重复的 # 标题（若与传入的 article title 相同）
  if (options.stripRedundantTitle) {
    const targetTitle = options.stripRedundantTitle.trim().toLowerCase();
    const h1Match = rawBody.match(/^\s*#\s+(.+?)(?:\r?\n|$)/);
    if (h1Match && h1Match[1].trim().toLowerCase() === targetTitle) {
      rawBody = rawBody.replace(/^\s*#\s+[^\r\n]+(?:\r?\n|$)/, "").trim();
    }
  }

  if (!rawBody) return "";

  // 2. 解析为 HTML
  const markedEngine = createMarkedInstance();
  const rawHtml = markedEngine.parse(rawBody) as string;

  // 3. 后处理 Callouts
  const withCallouts = postProcessCallouts(rawHtml);

  return withCallouts;
}

/**
 * HTML → Markdown 转换器（用于从旧版 Tiptap HTML 平滑迁移到 Markdown）
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";

  // 若本来就是 Markdown，直接返回
  if (isMarkdown(html) && !html.includes("<p>") && !html.includes("<h")) {
    return html;
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });

  // 保留自定义内联嵌入块（音乐、视频、豆瓣、文章卡片、链接卡片）
  turndown.addRule("keepCustomEmbeds", {
    filter: (node) => {
      if (node.nodeName === "DIV") {
        const embedAttr = node.getAttribute("data-embed");
        if (embedAttr && ["music", "video", "douban", "article"].includes(embedAttr)) {
          return true;
        }
      }
      if (node.nodeName === "A" && node.classList.contains("link-card")) {
        return true;
      }
      return false;
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      return `\n\n${el.outerHTML}\n\n`;
    },
  });

  // 保留表情
  turndown.addRule("keepEmoji", {
    filter: (node) => {
      return node.nodeName === "IMG" && node.classList.contains("inline-emoji");
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      return el.outerHTML;
    },
  });

  try {
    return turndown.turndown(html);
  } catch (err) {
    console.error("htmlToMarkdown failed, falling back to raw html:", err);
    return html;
  }
}
