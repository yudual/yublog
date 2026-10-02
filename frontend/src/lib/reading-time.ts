import { stripMarkdownAndHtml } from "./frontmatter";

export interface ReadingStats {
  /** 纯文本总字数（CJK 字符数 + 英文词数） */
  words: number;
  /** 去除空白后的总字符数 */
  characters: number;
  /** 预计阅读分钟数（至少 1 分钟） */
  minutes: number;
  /** 中日韩 (CJK) 汉字数 */
  cjkCount: number;
  /** 英文/数字词数 */
  englishWords: number;
}

/**
 * 彻底清洗文章正文内容，剔除代码块、内联数据/Base64、Markdown 与 HTML 标签
 */
export function cleanArticleContent(rawContent: string): string {
  if (!rawContent || typeof rawContent !== "string") return "";

  let text = rawContent;

  // 1. 去除三反引号和波浪线代码块（含未闭合情况）
  text = text.replace(/(?:```|~~~)[a-zA-Z0-9_-]*\r?\n[\s\S]*?(?:(?:```|~~~)|$)/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/~~~[\s\S]*?~~~/g, "");

  // 2. 去除 Base64 图片或长 Data-URL（防止失真暴增字符）
  text = text.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/gi, "");

  // 3. 复用并增强 Markdown 与 HTML 剥离
  text = stripMarkdownAndHtml(text);

  // 4. 去除多余 URL 链接本身（留存的链接文本已有，但防止纯 URL 干扰）
  text = text.replace(/https?:\/\/[^\s)]+/gi, "");

  return text.trim();
}

/**
 * 计算文章阅读统计数据（字数、词数与预计阅读时间）
 * - 中文常规阅读速率约 350-400 字/分钟
 * - 英文常规阅读速率约 200 词/分钟
 * - 保证至少 1 分钟
 */
export function calculateReadingStats(content: string): ReadingStats {
  const clean = cleanArticleContent(content);

  if (!clean) {
    return {
      words: 0,
      characters: 0,
      minutes: 1,
      cjkCount: 0,
      englishWords: 0,
    };
  }

  // 统计 CJK 汉字与假名/谚文字符数
  const cjkMatches = clean.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // 统计英文与数字词数（将 CJK 字符视作空格分隔）
  const nonCjk = clean.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ");
  const wordMatches = nonCjk.match(/\b[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*\b/g);
  const englishWords = wordMatches ? wordMatches.length : 0;

  // 总字数（用于前台展示“X 字”）
  const words = cjkCount + englishWords;
  // 去除所有空白后的纯字符数
  const characters = clean.replace(/\s+/g, "").length;

  // 综合阅读时长：中文按 350 字/分，英文按 200 词/分
  const minutesFromCjk = cjkCount / 350;
  const minutesFromEn = englishWords / 200;
  const rawMinutes = minutesFromCjk + minutesFromEn;

  // 向上取整，且至少保证 1 分钟
  const minutes = Math.max(1, Math.ceil(rawMinutes));

  return {
    words,
    characters,
    minutes,
    cjkCount,
    englishWords,
  };
}

/**
 * 快捷获取预计阅读分钟数
 */
export function calculateReadingTime(content: string): number {
  return calculateReadingStats(content).minutes;
}
