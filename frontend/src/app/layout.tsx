import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import LoadingBar from "@/components/LoadingBar";
import ToastContainer from "@/components/ui/Toast";
import EmojiFadeController from "@/components/EmojiFadeController";
import FloatingNav from "@/components/navigation/FloatingNav";
import { getApiUrl } from "@/lib/api-fetch";

const API_URL = getApiUrl();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  // Fetch site settings first; fall back to owner profile, then defaults.
  let siteName = "YuBlog";
  let description = "Dual 的个人博客 · 朋友圈风格";
  let keywords = "";
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  let domain = (!envUrl || envUrl.includes("localhost")) ? "https://yugold.top" : envUrl;
  let ogImage = "";
  let faviconUrl = "";
  let ownerAvatar = "";
  let ownerCover = "";

  try {
    const [settingsRes, ownerRes] = await Promise.all([
      fetch(`${API_URL}/settings`, { next: { revalidate: 60, tags: ["settings"] } }),
      fetch(`${API_URL}/users/owner`, { next: { revalidate: 60, tags: ["owner"] } }),
    ]);

    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      if (settings.siteName) siteName = settings.siteName;
      if (settings.description) description = settings.description;
      if (settings.keywords) keywords = settings.keywords;
      if (settings.domain) domain = settings.domain;
      if (settings.ogImage) ogImage = settings.ogImage;
      if (settings.faviconUrl) faviconUrl = settings.faviconUrl;
    }

    if (ownerRes.ok) {
      const owner = await ownerRes.json();
      if (owner.avatar) ownerAvatar = owner.avatar;
      if (owner.cover) ownerCover = owner.cover;
      // If site settings are at defaults, use owner's nickname/bio as fallback
      if (siteName === "YuBlog" && owner.nickname) siteName = `${owner.nickname} · YuBlog`;
      if (description === "Dual 的个人博客 · 朋友圈风格" && owner.bio) {
        description = owner.bio;
      }
    }
  } catch {
    // use defaults
  }

  // 保证 description 丰满饱满，提升搜索引擎抓取与社交分享展现效果
  const cleanDescription = (description || "").trim();
  const finalDescription =
    cleanDescription && cleanDescription.length > 8 && cleanDescription !== "Dual的博客"
      ? cleanDescription
      : "Dual 的个人空间与技术博客 · 记录思考、技术随笔与日常动态。";

  // 社交分享卡片配图优先级：后台配图 -> 博主封面 -> 博主头像 -> 默认兜底图
  const rawOgImage = ogImage || ownerCover || ownerAvatar || "/avatar-owner.svg";
  const resolvedOgImage = rawOgImage.startsWith("http")
    ? rawOgImage
    : `${domain ? domain.replace(/\/+$/, "") : ""}${rawOgImage.startsWith("/") ? rawOgImage : `/${rawOgImage}`}`;

  const cleanDomain = domain ? domain.replace(/\/+$/, "") : "https://yugold.top";

  const metadata: Metadata = {
    title: {
      default: siteName,
      template: `%s · ${siteName}`,
    },
    description: finalDescription,
    metadataBase: new URL(cleanDomain),
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: siteName,
      description: finalDescription,
      url: cleanDomain,
      siteName: siteName,
      locale: "zh_CN",
      type: "website",
      images: [
        {
          url: resolvedOgImage,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteName,
      description: finalDescription,
      images: [resolvedOgImage],
    },
  };

  const faviconFullUrl = faviconUrl
    ? (faviconUrl.startsWith("http") ? faviconUrl : `${cleanDomain}${faviconUrl.startsWith("/") ? faviconUrl : `/${faviconUrl}`}`)
    : "";

  metadata.icons = {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      ...(faviconFullUrl ? [{ url: faviconFullUrl }] : [{ url: "/icon", type: "image/png" }]),
    ],
    shortcut: faviconFullUrl || "/favicon.ico",
    apple: [
      { url: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };

  if (keywords) {
    metadata.keywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  }

  return metadata;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 获取站点设置中的自定义字体；留空则使用内嵌 HarmonyOS Sans 字体（globals.css 中的 @font-face）
  let fontUrl = "";
  let fontFamily = "";
  let rssEnabled = true;
  try {
    const settingsRes = await fetch(`${API_URL}/settings`, { next: { revalidate: 60, tags: ["settings"] } });
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      if (settings.fontUrl && settings.fontFamily) {
        fontUrl = settings.fontUrl;
        fontFamily = settings.fontFamily;
      }
      if (typeof settings.rssEnabled === "boolean") rssEnabled = settings.rssEnabled;
    }
  } catch {
    // use default embedded font
  }

  const customFontStyle = fontFamily
    ? ({ "--site-font-family": `"${fontFamily}"` } as React.CSSProperties)
    : undefined;

  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      style={customFontStyle}
      suppressHydrationWarning
    >
      <head>
        {rssEnabled && (
          <link rel="alternate" type="application/rss+xml" title="RSS 订阅" href="/feed" />
        )}
        {fontUrl && (
          <link rel="stylesheet" href={fontUrl} referrerPolicy="no-referrer" />
        )}
      </head>
      <body className="min-h-full bg-white text-wechat-text dark:bg-wechat-bg">
        <div id="initial-loading-bar" />
        <LoadingBar />
        <ThemeProvider>
          <ToastContainer />
          <FloatingNav />
          {children}
          <EmojiFadeController />
        </ThemeProvider>
      </body>
    </html>
  );
}
