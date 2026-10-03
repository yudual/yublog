/**
 * URL 预览路由
 * 抓取目标网页的 OG meta 标签，返回链接卡片信息。
 * 用于发布动态时插入微信朋友圈风格的链接卡片。
 */
import { Router, Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { authenticate } from "../middleware/auth";
import { assertPublicHttpUrl } from "../utils/ssrf-guard";

const router = Router();

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

function resolveSafeImageUrl(value: string, baseUrl: string): string {
  if (!value) return "";
  try {
    const resolved = new URL(value, baseUrl);
    if ((resolved.protocol !== "http:" && resolved.protocol !== "https:") || resolved.username || resolved.password) {
      return "";
    }
    return resolved.href;
  } catch {
    return "";
  }
}

/**
 * 带 SSRF 防护的页面抓取：每一跳（含重定向目标）都重新做
 * 协议 + DNS 解析校验，防止通过重定向绕到内网地址。
 */
async function fetchPageHtml(rawUrl: string): Promise<string> {
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    const validated = await assertPublicHttpUrl(current);
    let resp;
    try {
      resp = await axios.get(validated.href, {
        timeout: 10000,
        maxRedirects: 0,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        responseType: "text",
        maxContentLength: MAX_HTML_BYTES,
        maxBodyLength: MAX_HTML_BYTES,
        transformResponse: [(data) => data],
      });
      return typeof resp.data === "string" ? resp.data : "";
    } catch (err: any) {
      const status = err?.response?.status;
      const location = err?.response?.headers?.location;
      const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
      if (isRedirect && location && hop < MAX_REDIRECTS) {
        current = new URL(String(location), validated.href).href;
        continue;
      }
      throw err;
    }
  }
}

interface LinkCardData {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

/**
 * 从 HTML 中提取链接卡片信息
 * 优先使用 OG meta 标签，回退到 <title> 和 <meta name="description">
 */
function extractLinkCard(html: string, url: string): LinkCardData {
  const $ = cheerio.load(html);

  const ogTitle =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    "";
  const ogDescription =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[property="og:image:url"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[name="twitter:image:src"]').attr("content") ||
    "";

  // Favicon 回退：OG image → apple-touch-icon → icon → shortcut icon → Google 服务
  const linkIcon =
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="alternate icon"]').attr("href") ||
    "";

  const ogSiteName =
    $('meta[property="og:site_name"]').attr("content") ||
    "";

  let siteName = ogSiteName;
  let hostname = "";
  if (!siteName) {
    try {
      hostname = new URL(url).hostname.replace(/^www\./, "");
      siteName = hostname;
    } catch {
      siteName = "";
    }
  } else {
    try {
      hostname = new URL(url).hostname;
    } catch {}
  }

  let imageUrl = resolveSafeImageUrl(ogImage, url);

  // 无 OG image 时回退到 favicon
  if (!imageUrl) {
    if (linkIcon) {
      imageUrl = resolveSafeImageUrl(linkIcon, url);
    }
    // 最终回退：Google favicon 服务（128px 高清）
    if (!imageUrl && hostname) {
      imageUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
    }
  }

  return {
    url,
    title: ogTitle.trim(),
    description: ogDescription.trim(),
    image: imageUrl,
    siteName: siteName.trim(),
  };
}

// GET /api/url-preview?url=...
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response) => {
    const url = String(req.query.url || "");
    if (!url) {
      res.status(400).json({ message: "请提供 url 参数" });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({ message: "无效的 URL" });
      return;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      res.status(400).json({ message: "仅支持 http/https 协议" });
      return;
    }

    try {
      const html = await fetchPageHtml(url);
      if (!html) {
        res.status(422).json({ message: "无法获取网页内容" });
        return;
      }

      const card = extractLinkCard(html, url);
      if (!card.title && !card.description && !card.image) {
        res.status(422).json({ message: "无法提取链接信息" });
        return;
      }

      res.json(card);
    } catch (err: any) {
      if (!axios.isAxiosError(err)) {
        // assertPublicHttpUrl / 手动重定向抛出的防护错误
        res.status(400).json({ message: err?.message || "URL 被拒绝" });
        return;
      }
      const status = err?.response?.status;
      if (status === 404) {
        res.status(404).json({ message: "目标页面不存在" });
      } else if (err?.code === "ECONNABORTED") {
        res.status(504).json({ message: "请求超时" });
      } else {
        res.status(502).json({ message: "无法访问目标网址" });
      }
    }
  }
);

export default router;
